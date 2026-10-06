import { z } from '@/lib/zod'
import type { DatasetInput } from '@/engine/load'
import { CsvOptionsSchema } from '@/engine/ingest'
import { TypeOverrideSchema } from '@/engine/retype'
import { SAMPLES } from '@/engine/samples'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { clearOpfs, opfsSupported, readOpfsFile, removeOpfsFile, writeOpfsFile } from '@/lib/opfs'
import { inputs, type StoredInput } from '@/stores/datasetInputs'
import { useDatasetsStore } from '@/stores/datasets'
import { backupCorruptRecord } from '@/stores/persistence'
import { useSettingsStore } from '@/stores/settings'

// Keep datasets across reloads (F-DATA-12, opt-in): each loaded file's bytes go to the Origin
// Private File System (named by dataset id) and a manifest in IndexedDB says how to load them
// again: CSV options, sheet, type overrides. Samples are just regenerated. On start, the manifest
// is replayed through the normal ingest jobs. Nothing leaves the device.

const PersistedInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    format: z.enum(['csv', 'parquet', 'json']),
    csv: CsvOptionsSchema.nullable(),
  }),
  z.object({ kind: z.literal('excel'), sheet: z.string() }),
  z.object({ kind: z.literal('paste') }),
  z.object({ kind: z.literal('sample'), sampleId: z.string() }),
])
type PersistedInput = z.infer<typeof PersistedInputSchema>

export const PersistedDatasetSchema = z.object({
  id: z.string(),
  table: z.string(),
  label: z.string(),
  fileName: z.string().nullable(),
  /** The bytes are in OPFS under `id` (not for samples). */
  stored: z.boolean(),
  input: PersistedInputSchema,
  ignoreErrors: z.boolean(),
  overrides: z.array(TypeOverrideSchema),
  savedAt: z.number(),
})
export type PersistedDataset = z.infer<typeof PersistedDatasetSchema>

export const PERSISTED_RECORD: RecordSpec<PersistedDataset[]> = {
  key: 'persistedDatasets',
  version: 1,
  schema: z.array(PersistedDatasetSchema),
  fallback: () => [],
}

/** What to keep for a loaded input: how to load it again, and the bytes (null for samples). */
export function describeInput(input: DatasetInput): {
  input: PersistedInput
  fileName: string | null
  blob: Blob | null
} {
  switch (input.kind) {
    case 'file':
      return {
        input: { kind: 'file', format: input.format, csv: input.csv ?? null },
        fileName: input.file.name,
        blob: input.file,
      }
    case 'excel':
      return {
        input: { kind: 'excel', sheet: input.sheet },
        fileName: input.file.name,
        blob: input.file,
      }
    case 'paste':
      return {
        input: { kind: 'paste' },
        fileName: null,
        blob: new Blob([input.text], { type: 'text/plain' }),
      }
    case 'sample':
      return { input: { kind: 'sample', sampleId: input.sample.id }, fileName: null, blob: null }
  }
}

/** The input to load a kept dataset again, or null when it can't be (missing sample). */
export async function toDatasetInput(
  entry: PersistedDataset,
  stored: File | null,
): Promise<DatasetInput | null> {
  const file = () => new File([stored ?? new Blob()], entry.fileName ?? entry.label)
  switch (entry.input.kind) {
    case 'file':
      return stored
        ? {
            kind: 'file',
            file: file(),
            format: entry.input.format,
            csv: entry.input.csv ?? undefined,
          }
        : null
    case 'excel':
      return stored ? { kind: 'excel', file: file(), sheet: entry.input.sheet } : null
    case 'paste':
      return stored ? { kind: 'paste', text: await stored.text() } : null
    case 'sample': {
      const sampleId = entry.input.sampleId
      const sample = SAMPLES.find((s) => s.id === sampleId)
      return sample ? { kind: 'sample', sample } : null
    }
  }
}

// ---- Keeping the manifest in step with the loaded datasets ----

let manifest: PersistedDataset[] = []
let loaded: Promise<void> | null = null
let queue: Promise<void> = Promise.resolve()

const loadManifest = () =>
  (loaded ??= loadRecord(PERSISTED_RECORD, { onCorrupt: backupCorruptRecord })
    .then((saved) => {
      manifest = saved
    })
    .catch((error: unknown) => console.warn('flashQuery: kept files could not be listed', error)))

const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch((error: unknown) => {
    console.warn('flashQuery: keeping files failed', error)
  })
  return queue
}

async function sync(): Promise<void> {
  await loadManifest()
  const { datasets, jobs, restarting } = useDatasetsStore.getState()
  if (restarting) return
  // Jobs still loading (or failed) keep their entries: a restart or restore is under way.
  const pending = new Set(jobs.map((job) => job.id))
  const next: PersistedDataset[] = manifest.filter((entry) => pending.has(entry.id))
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
    })
  }
  for (const entry of manifest) {
    if (entry.stored && !next.some((kept) => kept.id === entry.id)) await removeOpfsFile(entry.id)
  }
  manifest = next
  await saveRecord(PERSISTED_RECORD, manifest)
}

async function forgetAll(): Promise<void> {
  await loadManifest()
  await clearOpfs()
  manifest = []
  await saveRecord(PERSISTED_RECORD, manifest)
}

let started = false

/** Follows dataset and setting changes (once, from App, after settings are loaded). */
export function startFilePersistence(): void {
  if (started || !opfsSupported()) return
  started = true
  useDatasetsStore.subscribe((state, previous) => {
    if (state.datasets === previous.datasets && state.restarting === previous.restarting) return
    if (useSettingsStore.getState().persistFiles) void enqueue(sync)
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

/** Loads every kept dataset again (at startup, when the setting is on). */
export async function restorePersistedDatasets(): Promise<number> {
  if (!opfsSupported()) return 0
  await loadManifest()
  let restored = 0
  for (const entry of manifest) {
    const file = entry.stored ? await readOpfsFile(entry.id).catch(() => null) : null
    const input = await toDatasetInput(entry, file)
    if (!input) continue
    useDatasetsStore
      .getState()
      .startJob(
        { id: entry.id, label: entry.label, table: entry.table },
        { input, ignoreErrors: entry.ignoreErrors, overrides: entry.overrides },
      )
    restored += 1
  }
  return restored
}

/** Bytes this site stores (all of IndexedDB and OPFS), when the browser says. */
export async function storageUsed(): Promise<number | null> {
  const estimate = await navigator.storage?.estimate?.().catch(() => null)
  return estimate?.usage ?? null
}
