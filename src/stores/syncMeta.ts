import type { RecordSpec } from '@/lib/idb'
import { z } from '@/lib/zod'
import { PROJECT_RECORD_KEYS } from '@/stores/projectScope'
import { PROJECTS_RECORD, REMOVED_PROJECTS_RECORD } from '@/stores/projects'

// What the account sync remembers on this device (M17), and which local records it saves where.

export const SyncMetaSchema = z.object({
  /** The account this device's workspace saves to. */
  userId: z.string(),
  /** Its vault (set up again elsewhere: another key). */
  vaultCreatedAt: z.string(),
  /** What this device last saw of each record ("scope/key"): its version and when it was saved. */
  records: z.record(z.string(), z.object({ version: z.number(), savedAt: z.number() })),
  /** The service's time of the latest change pulled. */
  cursor: z.string().nullable(),
  /** Each project's files in the account, as its file list last said. */
  files: z.record(z.string(), z.array(z.object({ fileId: z.string(), chunks: z.number() }))),
  /** Projects whose records still have to go from the account (removed while offline). */
  forget: z.array(z.string()),
})
export type SyncMeta = z.infer<typeof SyncMetaSchema>

export const SYNC_META_RECORD: RecordSpec<SyncMeta | null> = {
  key: 'syncMeta',
  version: 1,
  schema: SyncMetaSchema.nullable(),
  fallback: () => null,
}

export const newMeta = (userId: string, vaultCreatedAt: string): SyncMeta => ({
  userId,
  vaultCreatedAt,
  records: {},
  cursor: null,
  files: {},
  forget: [],
})

export const GLOBAL = 'global'
export const PROJECTS = 'projects'
export const isProjectRecordKey = (key: string): key is (typeof PROJECT_RECORD_KEYS)[number] =>
  (PROJECT_RECORD_KEYS as readonly string[]).includes(key)

/** Where a local record goes in the account; null for one that doesn't sync. */
export function remoteName(localKey: string): { scope: string; key: string } | null {
  if (localKey === PROJECTS_RECORD.key || localKey === REMOVED_PROJECTS_RECORD.key) {
    return { scope: GLOBAL, key: PROJECTS }
  }
  const match = /^p:(.+):([A-Za-z]+)$/.exec(localKey)
  const [, scope, key] = match ?? []
  return scope && key && isProjectRecordKey(key) ? { scope, key } : null
}
