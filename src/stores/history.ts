import { z } from '@/lib/zod'
import { create } from 'zustand'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { backupCorruptRecord } from '@/stores/persistence'
import { inProject } from '@/stores/projectScope'

// History (F-EXPL-05): every question and SQL-editor query with its time and outcome, persisted
// in IndexedDB (F-EXP-02). No result rows are stored.

export const HistoryEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['question', 'query']),
  /** The question, or the SQL for queries. */
  text: z.string(),
  sql: z.string().nullable(),
  /** 'python': a Python plan, run (or not) from its answer card. */
  status: z.enum(['answered', 'no-sql', 'python', 'failed']),
  headline: z.string().nullable(),
  rowCount: z.number().nullable(),
  at: z.number(),
})
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>

const MAX_ENTRIES = 200

export const HISTORY_RECORD: RecordSpec<HistoryEntry[]> = {
  key: 'history',
  version: 1,
  schema: z.array(HistoryEntrySchema),
  fallback: () => [],
}

interface HistoryState {
  entries: HistoryEntry[]
  hydrated: boolean
  add: (entry: Omit<HistoryEntry, 'id' | 'at'>) => void
  remove: (id: string) => void
  clear: () => void
  hydrate: () => Promise<void>
}

let counter = 0
let hydrating: Promise<void> | null = null

export const useHistoryStore = create<HistoryState>()((set) => ({
  entries: [],
  hydrated: false,
  add: (entry) =>
    set((state) => ({
      entries: [
        { ...entry, id: `h_${Date.now().toString(36)}_${(counter += 1)}`, at: Date.now() },
        ...state.entries,
      ].slice(0, MAX_ENTRIES),
    })),
  remove: (id) => set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
  clear: () => set({ entries: [] }),
  hydrate: () => (hydrating ??= load()),
}))

/** Loads saved history once, then saves on every change. */
async function load() {
  const saved = await loadRecord(inProject(HISTORY_RECORD), {
    onCorrupt: backupCorruptRecord,
  }).catch((error: unknown) => {
    console.warn('flashQuery: history could not be loaded', error)
    return []
  })
  // Keep anything added before hydration finished.
  useHistoryStore.setState((state) => ({
    entries: [...state.entries, ...saved].slice(0, MAX_ENTRIES),
    hydrated: true,
  }))
  useHistoryStore.subscribe((state, previous) => {
    if (state.entries === previous.entries) return
    saveRecord(inProject(HISTORY_RECORD), state.entries).catch((error: unknown) =>
      console.warn('flashQuery: history could not be saved', error),
    )
  })
}
