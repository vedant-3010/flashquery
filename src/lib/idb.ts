import { clear, createStore, del, get, keys, set } from 'idb-keyval'
import type { z } from '@/lib/zod'

// Local persistence (F-EXP-02): each record is stored as { version, savedAt, data }, validated with
// Zod on load and migrated forward from older versions. Anything unreadable (corrupt, from a newer
// app version, failing validation) is handed to onCorrupt (a backup download in the app) and reset.

export interface KeyValueStore {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  /** Every saved key (a project's records share a prefix, F-HOME-02). */
  keys(): Promise<string[]>
  /** Removes every record (F-EXP-04). */
  clear(): Promise<void>
}

let database: ReturnType<typeof createStore> | null = null
const idbDatabase = () => (database ??= createStore('HushGlance', 'records'))

export const idbStore: KeyValueStore = {
  get: (key) => get(key, idbDatabase()),
  set: (key, value) => set(key, value, idbDatabase()),
  del: (key) => del(key, idbDatabase()),
  keys: async () =>
    (await keys(idbDatabase())).filter((key): key is string => typeof key === 'string'),
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

export function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    'data' in value
  )
}

/**
 * A saved envelope read with `spec`: migrated and validated, or why it can't be. `newer`: saved by
 * a newer version of the app (another device can be ahead of this one).
 */
export function parseEnvelope<T>(
  spec: RecordSpec<T>,
  raw: unknown,
): { ok: true; data: T } | { ok: false; reason: string; newer: boolean } {
  const fail = (reason: string, newer = false) => ({ ok: false as const, reason, newer })
  if (!isEnvelope(raw)) return fail('Not a saved HushGlance record.')
  if (raw.version > spec.version) {
    return fail(`Saved by a newer version of HushGlance (v${raw.version}).`, true)
  }
  let data = raw.data
  for (let version = raw.version; version < spec.version; version += 1) {
    const migrate = spec.migrations?.[version]
    if (!migrate) return fail(`No migration from version ${version}.`)
    try {
      data = migrate(data)
    } catch (error) {
      return fail(`Migration from version ${version} failed: ${String(error)}`)
    }
  }
  const parsed = spec.schema.safeParse(data)
  if (!parsed.success) return fail(`Invalid data: ${parsed.error.issues[0]?.message ?? 'unknown'}`)
  return { ok: true, data: parsed.data }
}

export async function loadRecord<T>(
  spec: RecordSpec<T>,
  {
    store = idbStore,
    onCorrupt,
    readOnly = false,
  }: {
    store?: KeyValueStore
    onCorrupt?: (record: CorruptRecord) => void
    /** Peek without resetting an unreadable record (Home reading other projects' history). */
    readOnly?: boolean
  } = {},
): Promise<T> {
  const raw = await store.get(spec.key)
  if (raw === undefined) return spec.fallback()
  const parsed = parseEnvelope(spec, raw)
  if (parsed.ok) return parsed.data
  if (readOnly) return spec.fallback()
  onCorrupt?.({ key: spec.key, reason: parsed.reason, raw })
  await store.del(spec.key)
  return spec.fallback()
}

/** Saves still being written, so a page that is about to reload can wait for them (D113). */
const writing = new Set<Promise<void>>()

async function track(write: Promise<void>): Promise<void> {
  writing.add(write)
  try {
    await write
  } finally {
    writing.delete(write)
  }
}

/** Hears about every save to IndexedDB (the account sync, M17): the record's key and envelope. */
export type SaveListener = (key: string, envelope: Envelope) => void
let saveListener: SaveListener | null = null

export function onRecordSaved(listener: SaveListener | null): void {
  saveListener = listener
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
  await track(store.set(spec.key, envelope))
  if (store === idbStore) saveListener?.(spec.key, envelope)
}

/** A record as saved (no migration or validation), or undefined. */
export async function readEnvelope(
  key: string,
  store: KeyValueStore = idbStore,
): Promise<Envelope | undefined> {
  const raw = await store.get(key)
  return isEnvelope(raw) ? raw : undefined
}

/**
 * Writes a record another device saved (the account sync), as it was saved: it loads, migrates and
 * validates like any other, and isn't announced back to the sync.
 */
export function writeEnvelope(
  key: string,
  envelope: Envelope,
  store: KeyValueStore = idbStore,
): Promise<void> {
  return track(store.set(key, envelope))
}

/** Resolves once every save started so far has finished (or failed). */
export async function whenSaved(): Promise<void> {
  await Promise.allSettled([...writing])
}

/** An in-memory KeyValueStore (tests, and a fallback when IndexedDB is unavailable). */
export function memoryStore(initial: Record<string, unknown> = {}): KeyValueStore {
  const values = new Map(Object.entries(initial))
  return {
    get: async (key) => values.get(key),
    set: async (key, value) => void values.set(key, value),
    del: async (key) => void values.delete(key),
    keys: async () => [...values.keys()],
    clear: async () => values.clear(),
  }
}
