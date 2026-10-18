import { AppError } from '@/lib/errors'
import {
  idbStore,
  isEnvelope,
  parseEnvelope,
  readEnvelope,
  writeEnvelope,
  type Envelope,
  type KeyValueStore,
  type RecordSpec,
} from '@/lib/idb'
import {
  mergeProjects,
  RemovedProjectSchema,
  remoteWins,
  type RemovedProject,
} from '@/lib/syncMerge'
import { decryptRecord, encryptRecord, recordAad } from '@/lib/vault'
import { z } from '@/lib/zod'
import type { RemoteChange, RemoteRecord } from '@/platform/vault'
import { PERSISTED_RECORD } from '@/stores/keptDatasets'
import { projectKey, type PROJECT_RECORD_KEYS } from '@/stores/projectScope'
import { PROJECTS_RECORD, type Project } from '@/stores/projects'
import { GLOBAL, isProjectRecordKey, PROJECTS, remoteName, type SyncMeta } from '@/stores/syncMeta'

// The account sync (M17, F-SYNC-02/03): pushes this device's saved records to the account and
// pulls other devices' changes, encrypting and decrypting on the way. No React, no Supabase: the
// account is a `SyncRemote` (src/platform/vault.ts in the app, a fake in tests).
//
// - Local records: `projects` (+ `removedProjects`) → ("global", "projects"); `p:<id>:<key>` →
//   (<id>, <key>) for PROJECT_RECORD_KEYS, in projects that sync.
// - Each record in the account is a saved envelope ({ version, savedAt, data }), encrypted with
//   additional data naming its owner, place and version (src/lib/vault.ts).
// - Saves carry the version they replace (sync_put): a stale one is refused, the newer copy is
//   pulled and merged (src/lib/syncMerge.ts), and the save is tried again.

export interface SyncRemote {
  putRecord: (
    scope: string,
    key: string,
    expected: number,
    sealed: string,
  ) => Promise<number | null>
  getRecord: (scope: string, key: string) => Promise<RemoteRecord | null>
  pullChanges: (since: string | null) => Promise<RemoteChange[]>
  deleteRecords: (scope: string) => Promise<void>
  deleteFile: (fileId: string, chunks: number) => Promise<void>
}

/** What the engine needs from the app: the project list, and where to tell about changes. */
export interface SyncHost {
  projects: () => { projects: Project[]; removed: RemovedProject[] }
  /** Projects that never sync whatever their setting (the try projects). */
  neverSyncs: (projectId: string) => boolean
  applyProjects: (
    projects: Project[],
    removed: RemovedProject[],
    deleted: string[],
  ) => Promise<void>
  /** Another device's save replaced a record of `projectId` here. */
  changedElsewhere: (projectId: string, key: string) => void
}

/** Changes committed out of order by a few seconds still get pulled. */
const OVERLAP_MS = 30_000

const nameOf = (scope: string, key: string) => `${scope}/${key}`

const CloudProjectsSchema = z.object({
  projects: z.array(z.unknown()),
  removed: z.array(RemovedProjectSchema),
})

/** The files a project's file list says are in the account (none if it can't be read here). */
function cloudRefs(envelope: Envelope): { fileId: string; chunks: number }[] {
  const parsed = parseEnvelope(PERSISTED_RECORD, envelope)
  if (!parsed.ok) return []
  return parsed.data.flatMap((entry) =>
    entry.cloud ? [{ fileId: entry.cloud.fileId, chunks: entry.cloud.chunks }] : [],
  )
}

export interface SyncDeps {
  remote: SyncRemote
  key: CryptoKey
  meta: SyncMeta
  host: SyncHost
  specs: Record<(typeof PROJECT_RECORD_KEYS)[number], RecordSpec<unknown>>
  store?: KeyValueStore
}

export class SyncEngine {
  private readonly dirty = new Set<string>()
  private queue: Promise<void> = Promise.resolve()
  /** The project list as the account last had it (JSON), so an unchanged list isn't saved again. */
  private lastProjects: string | null = null
  /** Some record came from a newer version of the app: this one should update. */
  newerApp = false

  private readonly deps: SyncDeps

  constructor(deps: SyncDeps) {
    this.deps = deps
  }

  get meta(): SyncMeta {
    return this.deps.meta
  }

  private get store() {
    return this.deps.store ?? idbStore
  }

  /** Projects kept on this device only (their setting, or the try projects). */
  private readonly keepHere = (project: Project) =>
    project.localOnly || this.deps.host.neverSyncs(project.id)

  /** Whether project `id` saves to the account on this device. */
  syncable(id: string): boolean {
    const project = this.deps.host.projects().projects.find((p) => p.id === id)
    return project !== undefined && !this.keepHere(project)
  }

  /** Records waiting to be saved to the account. */
  get pending(): number {
    return this.dirty.size + this.meta.forget.length
  }

  /** A local record was saved: true when it goes to the account (push soon). */
  changed(localKey: string): boolean {
    const name = remoteName(localKey)
    if (!name || (name.scope !== GLOBAL && !this.syncable(name.scope))) return false
    this.dirty.add(nameOf(name.scope, name.key))
    return true
  }

  /** Marks everything this device saved that the account may not have (on unlock). */
  async scan(): Promise<void> {
    this.dirty.add(nameOf(GLOBAL, PROJECTS))
    for (const localKey of await this.store.keys()) {
      const name = remoteName(localKey)
      if (!name || name.scope === GLOBAL || !this.syncable(name.scope)) continue
      const envelope = await readEnvelope(localKey, this.store)
      const seen = this.meta.records[nameOf(name.scope, name.key)]
      if (envelope && (!seen || envelope.savedAt > seen.savedAt)) {
        this.dirty.add(nameOf(name.scope, name.key))
      }
    }
  }

  /** Project `id` left the account (deleted, or kept on one device): its records go too. */
  forgetProject(id: string): void {
    if (!this.meta.forget.includes(id)) this.meta.forget.push(id)
    for (const name of [...this.dirty]) if (name.startsWith(`${id}/`)) this.dirty.delete(name)
  }

  /** Pulls other devices' changes, then saves this device's; one run at a time. */
  sync(): Promise<void> {
    return this.serial(async () => {
      await this.pull()
      await this.push()
    })
  }

  /** Saves this device's changes (after the debounce). */
  flush(): Promise<void> {
    return this.serial(() => this.push())
  }

  private serial(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task)
    this.queue = run.catch(() => undefined)
    return run
  }

  // ---- Pull ----

  private async pull(): Promise<void> {
    const cursor = this.meta.cursor
    const since = cursor === null ? null : new Date(Date.parse(cursor) - OVERLAP_MS).toISOString()
    const changes = await this.deps.remote.pullChanges(since)
    for (const change of changes) {
      const seen = this.meta.records[nameOf(change.scope, change.key)]
      if (seen && seen.version >= change.version) continue
      const record = await this.deps.remote.getRecord(change.scope, change.key)
      if (record) await this.apply(record)
    }
    const latest = changes.at(-1)?.updatedAt
    if (latest && (cursor === null || Date.parse(latest) > Date.parse(cursor))) {
      this.meta.cursor = latest
    }
  }

  /** Another device's copy of a record: merged into this device's. */
  private async apply(record: RemoteRecord): Promise<void> {
    const { userId } = this.meta
    const aad = recordAad(userId, record.scope, record.key, record.version)
    const payload = await decryptRecord(this.deps.key, record.ciphertext, aad)
    if (!isEnvelope(payload) || typeof payload.savedAt !== 'number') {
      throw new AppError({ code: 'vault_format', message: 'Unreadable saved data.', detail: aad })
    }
    if (record.scope === GLOBAL) {
      if (record.key === PROJECTS) await this.applyProjects(payload)
    } else if (isProjectRecordKey(record.key)) {
      await this.applyRecord(record.scope, record.key, payload)
    }
    this.meta.records[nameOf(record.scope, record.key)] = {
      version: record.version,
      savedAt: payload.savedAt,
    }
  }

  private async applyProjects(envelope: Envelope): Promise<void> {
    const cloud = CloudProjectsSchema.safeParse(envelope.data)
    const parsed = cloud.success
      ? parseEnvelope(PROJECTS_RECORD, { ...envelope, data: cloud.data.projects })
      : null
    if (!cloud.success || !parsed?.ok) {
      if (parsed && !parsed.ok && parsed.newer) this.newerApp = true
      return
    }
    const { host } = this.deps
    const local = host.projects()
    const merged = mergeProjects(
      local.projects,
      local.removed,
      { projects: parsed.data, removed: cloud.data.removed },
      this.keepHere,
    )
    await host.applyProjects(merged.projects, merged.removed, merged.deleted)
    const theirs = JSON.stringify(this.projectsPayload(parsed.data, cloud.data.removed))
    if (JSON.stringify(this.projectsPayload(merged.projects, merged.removed)) === theirs) {
      this.lastProjects = theirs
    } else {
      this.dirty.add(nameOf(GLOBAL, PROJECTS))
    }
  }

  private async applyRecord(
    scope: string,
    key: (typeof PROJECT_RECORD_KEYS)[number],
    envelope: Envelope,
  ): Promise<void> {
    const { host } = this.deps
    const known = host.projects()
    const here = known.projects.find((p) => p.id === scope)
    const deleted = known.removed.some((m) => m.id === scope && m.kind === 'deleted')
    if ((here && this.keepHere(here)) || (!here && deleted)) return
    const name = nameOf(scope, key)
    const localKey = projectKey(scope, key)
    const local = await readEnvelope(localKey, this.store)
    if (!remoteWins(local, envelope)) {
      this.dirty.add(name)
      return
    }
    const parsed = parseEnvelope(this.deps.specs[key], envelope)
    if (!parsed.ok) {
      if (parsed.newer) this.newerApp = true
      console.warn(`HushGlance: skipped "${name}" from another device: ${parsed.reason}`)
      return
    }
    await writeEnvelope(localKey, envelope, this.store)
    this.dirty.delete(name)
    if (key === PERSISTED_RECORD.key) this.meta.files[scope] = cloudRefs(envelope)
    host.changedElsewhere(scope, key)
  }

  // ---- Push ----

  private async push(): Promise<void> {
    for (const id of [...this.meta.forget]) {
      await this.deps.remote.deleteRecords(id)
      for (const file of this.meta.files[id] ?? []) await this.dropFile(file)
      delete this.meta.files[id]
      for (const name of Object.keys(this.meta.records)) {
        if (name.startsWith(`${id}/`)) delete this.meta.records[name]
      }
      this.meta.forget = this.meta.forget.filter((other) => other !== id)
    }
    for (const name of [...this.dirty]) {
      this.dirty.delete(name)
      const [scope = '', key = ''] = name.split('/')
      try {
        if (scope === GLOBAL) await this.put(scope, key, () => this.projectsEnvelope())
        else if (this.syncable(scope))
          await this.put(scope, key, () => this.recordEnvelope(scope, key))
      } catch (error) {
        this.dirty.add(name)
        throw error
      }
    }
  }

  /** The project list as the account keeps it: projects that sync, in a stable order. */
  private projectsPayload(projects: readonly Project[], removed: readonly RemovedProject[]) {
    return {
      projects: projects
        .filter((project) => !this.keepHere(project))
        .map((project) => ({ ...project, localOnly: false }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      removed: removed.filter((marker) => !this.deps.host.neverSyncs(marker.id)),
    }
  }

  private async projectsEnvelope(): Promise<Envelope | null> {
    const { projects, removed } = this.deps.host.projects()
    const data = this.projectsPayload(projects, removed)
    if (JSON.stringify(data) === this.lastProjects) return null
    return { version: PROJECTS_RECORD.version, savedAt: Date.now(), data }
  }

  private async recordEnvelope(scope: string, key: string): Promise<Envelope | null> {
    const envelope = await readEnvelope(projectKey(scope, key), this.store)
    const seen = this.meta.records[nameOf(scope, key)]
    return envelope && (!seen || envelope.savedAt > seen.savedAt) ? envelope : null
  }

  /** Saves `build()` over the version this device last saw; on a conflict, merges and retries. */
  private async put(
    scope: string,
    key: string,
    build: () => Promise<Envelope | null>,
  ): Promise<void> {
    const name = nameOf(scope, key)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const envelope = await build()
      if (!envelope) return
      const expected = this.meta.records[name]?.version ?? 0
      const aad = recordAad(this.meta.userId, scope, key, expected + 1)
      const sealed = await encryptRecord(this.deps.key, envelope, aad)
      const saved = await this.deps.remote.putRecord(scope, key, expected, sealed)
      if (saved !== null) {
        this.meta.records[name] = { version: saved, savedAt: envelope.savedAt }
        await this.saved(scope, key, envelope)
        return
      }
      // Another device saved first: take in its copy, then try again with what's left to save.
      const current = await this.deps.remote.getRecord(scope, key)
      if (current) await this.apply(current)
      else delete this.meta.records[name]
    }
    throw new AppError({
      code: 'sync_conflict',
      message: 'Another device keeps changing this project. Try again in a moment.',
      detail: name,
    })
  }

  private async saved(scope: string, key: string, envelope: Envelope): Promise<void> {
    if (scope === GLOBAL) {
      this.lastProjects = JSON.stringify(envelope.data)
      return
    }
    if (key !== PERSISTED_RECORD.key) return
    // Files this list no longer mentions (removed datasets) leave the account.
    const now = cloudRefs(envelope)
    for (const file of this.meta.files[scope] ?? []) {
      if (!now.some((kept) => kept.fileId === file.fileId)) await this.dropFile(file)
    }
    this.meta.files[scope] = now
  }

  private async dropFile(file: { fileId: string; chunks: number }): Promise<void> {
    await this.deps.remote.deleteFile(file.fileId, file.chunks).catch((error: unknown) => {
      // Left for the clean-up of unreferenced files (src/stores/sync.ts).
      console.warn('HushGlance: a removed file could not be deleted from the account', error)
    })
  }
}
