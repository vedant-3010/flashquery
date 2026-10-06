import { clear, createStore, del, get, set } from 'idb-keyval'
import type { z } from '@/lib/zod'

// Local persistence (F-EXP-02): each record is stored as { version, savedAt, data }, validated with
// Zod on load and migrated forward from older versions. Anything unreadable (corrupt, from a newer
// app version, failing validation) is handed to onCorrupt (a backup download in the app) and reset.

export interface KeyValueStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  /** Removes every record (F-EXP-04). */
  clear(): Promise<void>
}

let database: ReturnType<typeof createStore> | null = null
const idbDatabase = () => (database ??= createStore('flashQuery', 'records'))

export const idbStore: KeyValueStore = {
  get: (key) => get(key, idbDatabase()),
  set: (key, value) => set(key, value, idbDatabase()),
  del: (key) => del(key, idbDatabase()),
  clear: () => clear(idbDatabase()),
}

export interface RecordSpec<T> {
  key: string
  version: number
  schema: z.ZodType<T>
  /** migrations[n] turns version-n data into version n+1. */
  migrations?: Record<number, (data: unknown) => unknown>
  fallback: () => T
}

export interface CorruptRecord {
  key: string
  reason: string
  raw: unknown
}

export interface Envelope {
  version: number
  savedAt: number
  data: unknown
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    'data' in value
  )
}

export async function loadRecord<T>(
  spec: RecordSpec<T>,
  {
    store = idbStore,
    onCorrupt,
  }: { store?: KeyValueStore; onCorrupt?: (record: CorruptRecord) => void } = {},
): Promise<T> {
  const raw = await store.get(spec.key)
  if (raw === undefined) return spec.fallback()

  const reset = async (reason: string) => {
    onCorrupt?.({ key: spec.key, reason, raw })
    await store.del(spec.key)
    return spec.fallback()
  }

  if (!isEnvelope(raw)) return reset('Not a saved flashQuery record.')
  if (raw.version > spec.version) {
    return reset(`Saved by a newer version of flashQuery (v${raw.version}).`)
  }
  let data = raw.data
  for (let version = raw.version; version < spec.version; version += 1) {
    const migrate = spec.migrations?.[version]
    if (!migrate) return reset(`No migration from version ${version}.`)
    try {
      data = migrate(data)
    } catch (error) {
      return reset(`Migration from version ${version} failed: ${String(error)}`)
    }
  }
  const parsed = spec.schema.safeParse(data)
  if (!parsed.success) return reset(`Invalid data: ${parsed.error.issues[0]?.message ?? 'unknown'}`)
  return parsed.data
}

export async function saveRecord<T>(
  spec: RecordSpec<T>,
  value: T,
  { store = idbStore }: { store?: KeyValueStore } = {},
): Promise<void> {
  const envelope: Envelope = {
    version: spec.version,
    savedAt: Date.now(),
    data: spec.schema.parse(value),
  }
  await store.set(spec.key, envelope)
}

/** An in-memory KeyValueStore (tests, and a fallback when IndexedDB is unavailable). */
export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const values = new Map(Object.entries(initial))
  return {
    get: async (key) => values.get(key),
    set: async (key, value) => void values.set(key, value),
    del: async (key) => void values.delete(key),
    clear: async () => values.clear(),
  }
}
