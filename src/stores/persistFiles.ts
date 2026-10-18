import { AppError } from '@/lib/errors'
import { idbStore, loadRecord, saveRecord, type KeyValueStore } from '@/lib/idb'
import { clearOpfs, opfsSupported, readOpfsFile, removeOpfsFile, writeOpfsFile } from '@/lib/opfs'
import { inputs, type StoredInput } from '@/stores/datasetInputs'
import { useDatasetsStore } from '@/stores/datasets'
import {
  describeInput,
  PERSISTED_RECORD,
  toDatasetInput,
  type CloudFile,
  type PersistedDataset,
} from '@/stores/keptDatasets'
import { backupCorruptRecord } from '@/stores/persistence'
import { inProject, projectKey, projectScope } from '@/stores/projectScope'
import { useSettingsStore } from '@/stores/settings'

// Keep datasets across reloads (F-DATA-12): each loaded file's bytes go to the Origin Private File
// System (named by dataset id) and a manifest in IndexedDB says how to load them again: CSV
// options, sheet, type overrides. Samples are just regenerated. On start, the manifest is replayed
// through the normal ingest jobs. Opt-in on its own; always on for a project saved to the account
// (M17, F-SYNC-04), whose files are also uploaded encrypted (src/stores/sync.ts does the moving)
// and downloaded on a device that doesn't have them.

// ---- Keeping the manifest in step with the loaded datasets ----

let manifest: PersistedDataset[] = []
let loaded: Promise<void> | null = null
let queue: Promise<void> = Promise.resolve()
/** Datasets loaded in this page: one missing from it later was removed, not just not back yet. */
const loadedHere = new Set<string>()

// ---- The account (M17): set by src/stores/sync.ts ----

/** How kept files reach the account, while the workspace is unlocked. */
export interface FileTransfer {
  upload: (file: Blob, fileId: string) => Promise<CloudFile>
  download: (
    file: CloudFile,
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ) => Promise<Blob>
  /** An upload failed (storage full, offline): the file stays on this device only. */
  failed: (error: unknown) => void
}

let synced: (projectId: string) => boolean = () => false
let transfer: FileTransfer | null = null
/** Uploads that failed in this page: not tried again until the sync changes. */
const failedUploads = new Set<string>()

/**
 * Which projects save to the account (their files are always kept), and how files move (null while
 * locked).
 */
export function setCloudFiles(next: {
  synced: (projectId: string) => boolean
  transfer: FileTransfer | null
}): void {
  synced = next.synced
  transfer = next.transfer
  failedUploads.clear()
  // The open project may keep its files only now, or its downloads can start: restore, then save.
  if (started && projectScope() !== null && keepsFiles()) {
    void restorePersistedDatasets().then(() => enqueue(sync))
  }
}

/** Whether a project keeps its files: the setting is on, or it's saved to the account. */
export function keepsFiles(projectId: string | null = projectScope()): boolean {
  if (useSettingsStore.getState().persistFiles) return true
  return projectId !== null && synced(projectId)
}

/** The file's id in the account: the same for the same dataset, so a cut-short upload resumes. */
const cloudFileId = (projectId: string, entry: PersistedDataset) =>
  `${projectId}-${entry.id}-${entry.savedAt.toString(36)}`.slice(0, 64)

const loadManifest = () =>
  (loaded ??= loadRecord(inProject(PERSISTED_RECORD), { onCorrupt: backupCorruptRecord })
    .then((saved) => {
      manifest = saved
    })
    .catch((error: unknown) => console.warn('HushGlance: kept files could not be listed', error)))

const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch((error: unknown) => {
    console.warn('HushGlance: keeping files failed', error)
  })
  return queue
}

async function sync(): Promise<void> {
  // Home has no project: its datasets (none) have no manifest to update.
  const scope = projectScope()
  if (scope === null) return
  await loadManifest()
  const { datasets, jobs, restarting } = useDatasetsStore.getState()
  if (restarting) return
  const current = new Set(datasets.map((dataset) => dataset.id))
  for (const id of current) loadedHere.add(id)
  // Jobs still loading (or failed) keep their entries: a restart or restore is under way. So do
  // entries not loaded in this page yet (a download waiting for the unlock): only a dataset
  // removed here leaves the list.
  const pending = new Set(jobs.map((job) => job.id))
  const next: PersistedDataset[] = manifest.filter(
    (entry) => !current.has(entry.id) && (pending.has(entry.id) || !loadedHere.has(entry.id)),
  )
  for (const dataset of datasets) {
    const stored: StoredInput | undefined = inputs.get(dataset.id)
    if (!stored) continue
    const existing = manifest.find((entry) => entry.id === dataset.id)
    const { input, fileName, blob } = describeInput(stored.input)
    if (blob && !existing?.stored) await writeOpfsFile(dataset.id, blob)
    next.push({
      id: dataset.id,
      table: dataset.table,
      label: dataset.label,
      fileName,
      stored: blob !== null,
      input,
      ignoreErrors: stored.ignoreErrors,
      overrides: stored.overrides ?? [],
      savedAt: existing?.savedAt ?? Date.now(),
      cloud: existing?.cloud ?? null,
    })
  }
  for (const entry of manifest) {
    if (entry.stored && !next.some((kept) => kept.id === entry.id)) await removeOpfsFile(entry.id)
  }
  manifest = next
  await saveRecord(inProject(PERSISTED_RECORD), manifest)
  if (transfer && synced(scope)) uploadMissing()
}

let uploading: Promise<void> | null = null

/**
 * Uploads the open project's kept files that aren't in the account yet, one at a time, outside the
 * queue (a page about to reload doesn't wait for them: the next one picks up where it stopped).
 */
function uploadMissing(): void {
  if (uploading) return
  // `finally` runs after the assignment, even when there's nothing to upload.
  uploading = uploadEach().finally(() => {
    uploading = null
  })
}

async function uploadEach(): Promise<void> {
  for (;;) {
    const scope = projectScope()
    const move = transfer
    if (scope === null || !move || !synced(scope)) return
    const entry = manifest.find((e) => e.stored && e.cloud === null && !failedUploads.has(e.id))
    if (!entry) return
    try {
      const cloud = await move.upload(await readOpfsFile(entry.id), cloudFileId(scope, entry))
      await enqueue(async () => {
        if (!manifest.some((e) => e.id === entry.id)) return
        manifest = manifest.map((e) => (e.id === entry.id ? { ...e, cloud } : e))
        await saveRecord(inProject(PERSISTED_RECORD), manifest)
      })
    } catch (error) {
      failedUploads.add(entry.id)
      move.failed(error)
    }
  }
}

/** Resolves once no upload is running (tests, and Settings' "Saved" state). */
export async function whenUploaded(): Promise<void> {
  while (uploading) await uploading
}

const projectOfManifest = (key: string) =>
  key.match(new RegExp(`^p:(.+):${PERSISTED_RECORD.key}$`))?.[1] ?? null

/**
 * Turning the setting off (it's global): kept files and their lists go, except in projects saved
 * to the account (they always keep theirs).
 */
async function forgetAll(): Promise<void> {
  const lists = (await idbStore.keys()).filter((key) => projectOfManifest(key) !== null)
  const keep = lists.filter((key) => synced(projectOfManifest(key) ?? ''))
  if (keep.length === 0) await clearOpfs()
  for (const key of lists) {
    const projectId = projectOfManifest(key)
    if (projectId === null || keep.includes(key)) continue
    await forgetProjectFiles(projectId)
    await idbStore.del(key)
  }
  if (!keepsFiles()) manifest = []
}

/**
 * A project taken off the account (M17): its kept files are on this device only again. Returns
 * the account's copies, for the sync to delete.
 */
export async function forgetCloudCopies(projectId: string): Promise<CloudFile[]> {
  const local = (entries: PersistedDataset[]) => entries.map((entry) => ({ ...entry, cloud: null }))
  if (projectId === projectScope()) {
    let copies: CloudFile[] = []
    await enqueue(async () => {
      await loadManifest()
      copies = manifest.flatMap((entry) => (entry.cloud ? [entry.cloud] : []))
      manifest = local(manifest)
      await saveRecord(inProject(PERSISTED_RECORD), manifest)
    })
    return copies
  }
  const spec = { ...PERSISTED_RECORD, key: projectKey(projectId, PERSISTED_RECORD.key) }
  const entries = await loadRecord(spec, { readOnly: true })
  const copies = entries.flatMap((entry) => (entry.cloud ? [entry.cloud] : []))
  if (copies.length > 0) await saveRecord(spec, local(entries))
  return copies
}

/** Deletes a project's kept files (when the project is deleted). */
export async function forgetProjectFiles(
  projectId: string,
  { store = idbStore }: { store?: KeyValueStore } = {},
): Promise<void> {
  const spec = { ...PERSISTED_RECORD, key: projectKey(projectId, PERSISTED_RECORD.key) }
  if (!opfsSupported()) return
  const kept = await loadRecord(spec, { store }).catch(() => [])
  for (const entry of kept) if (entry.stored) await removeOpfsFile(entry.id)
}

/** Resolves once kept files have been written (before the page reloads for another project). */
export function whenFilesSaved(): Promise<void> {
  return queue
}

let started = false

/** Follows dataset and setting changes (once, from App, after settings are loaded; Home too). */
export function startFilePersistence(): void {
  if (started || !opfsSupported()) return
  started = true
  useDatasetsStore.subscribe((state, previous) => {
    if (state.datasets === previous.datasets && state.restarting === previous.restarting) return
    if (keepsFiles()) void enqueue(sync)
  })
  useSettingsStore.subscribe((state, previous) => {
    if (state.persistFiles === previous.persistFiles) return
    if (state.persistFiles) {
      // Ask the browser not to evict the files under storage pressure.
      void navigator.storage.persist?.().catch(() => false)
      void enqueue(sync)
    } else {
      void enqueue(forgetAll)
    }
  })
}

/**
 * Loads every kept dataset that isn't loaded yet (when the project opens, and again once the
 * workspace unlocks): from this device, or downloaded from the account.
 */
export async function restorePersistedDatasets(): Promise<number> {
  if (!opfsSupported()) return 0
  await loadManifest()
  const { datasets, jobs } = useDatasetsStore.getState()
  const present = new Set([...datasets.map((d) => d.id), ...jobs.map((job) => job.id)])
  let restored = 0
  const gone: string[] = []
  for (const entry of manifest) {
    if (present.has(entry.id)) continue
    const job = { id: entry.id, label: entry.label, table: entry.table }
    const file = entry.stored ? await readOpfsFile(entry.id).catch(() => null) : null
    if (!file && entry.stored && entry.cloud && transfer) {
      useDatasetsStore.getState().downloadJob(job, download(entry, entry.cloud, transfer))
      restored += 1
      continue
    }
    const input = await toDatasetInput(entry, file)
    if (!input) {
      // Its bytes are gone from this device and it isn't in the account: nothing to load.
      if (!entry.cloud) gone.push(entry.id)
      continue
    }
    useDatasetsStore
      .getState()
      .startJob(job, { input, ignoreErrors: entry.ignoreErrors, overrides: entry.overrides })
    restored += 1
  }
  if (gone.length > 0) {
    void enqueue(async () => {
      manifest = manifest.filter((entry) => !gone.includes(entry.id))
      await saveRecord(inProject(PERSISTED_RECORD), manifest)
    })
  }
  return restored
}

/** Downloads a kept file from the account into this device's kept files, then its input. */
const download =
  (entry: PersistedDataset, cloud: CloudFile, move: FileTransfer) =>
  async (onProgress: (fraction: number) => void, signal: AbortSignal) => {
    await writeOpfsFile(entry.id, await move.download(cloud, onProgress, signal))
    const input = await toDatasetInput(entry, await readOpfsFile(entry.id))
    if (!input) {
      throw new AppError({
        code: 'download_failed',
        message: `${entry.label} couldn't be read after downloading.`,
        detail: null,
      })
    }
    return { input, ignoreErrors: entry.ignoreErrors, overrides: entry.overrides }
  }

/** Bytes this site stores (all of IndexedDB and OPFS), when the browser says. */
export async function storageUsed(): Promise<number | null> {
  const estimate = await navigator.storage?.estimate?.().catch(() => null)
  return estimate?.usage ?? null
}
