import { z } from '@/lib/zod'
import { create } from 'zustand'
import { suggestionKey, suggestWithAi } from '@/ai/suggest'
import { getDb } from '@/engine/duckdb'
import type { DatasetProfile } from '@/engine/types'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { isCancellation, toAppError } from '@/lib/errors'
import { currentProvider, logRequest } from '@/stores/askSupport'
import { backupCorruptRecord } from '@/stores/persistence'

// AI-suggested questions (F-PROF-04), cached per schema in IndexedDB so the same file gets the
// same chips after a reload without another request.

export const SUGGESTIONS_RECORD: RecordSpec<Record<string, string[]>> = {
  key: 'suggestions',
  version: 1,
  schema: z.record(z.string(), z.array(z.string())),
  fallback: () => ({}),
}

const MAX_KEYS = 50

interface SuggestionsState {
  byKey: Record<string, string[]>
  /** The key being fetched. */
  pending: string | null
  error: string | null
  request: (datasets: DatasetProfile[]) => Promise<void>
  hydrate: () => Promise<void>
}

let controller: AbortController | null = null

export const useSuggestionsStore = create<SuggestionsState>()((set, get) => ({
  byKey: {},
  pending: null,
  error: null,
  request: async (datasets) => {
    const key = suggestionKey(datasets)
    if (datasets.length === 0 || get().pending === key) return
    controller?.abort()
    const current = new AbortController()
    controller = current
    set({ pending: key, error: null })
    try {
      const [provider, engine] = await Promise.all([currentProvider(), getDb()])
      const questions = await suggestWithAi({
        provider,
        runner: engine,
        datasets,
        signal: current.signal,
        onLog: logRequest,
      })
      const entries = Object.entries({ ...get().byKey, [key]: questions }).slice(-MAX_KEYS)
      set({ byKey: Object.fromEntries(entries), pending: null })
    } catch (error) {
      if (isCancellation(error)) return
      set({ pending: null, error: toAppError(error).message })
    } finally {
      if (controller === current) controller = null
    }
  },
  hydrate: () => (hydrating ??= load()),
}))

let hydrating: Promise<void> | null = null

async function load() {
  const saved = await loadRecord(SUGGESTIONS_RECORD, { onCorrupt: backupCorruptRecord }).catch(
    (error: unknown) => {
      console.warn('flashQuery: suggestions could not be loaded', error)
      return {}
    },
  )
  useSuggestionsStore.setState((state) => ({ byKey: { ...saved, ...state.byKey } }))
  useSuggestionsStore.subscribe((state, previous) => {
    if (state.byKey === previous.byKey) return
    saveRecord(SUGGESTIONS_RECORD, state.byKey).catch((error: unknown) =>
      console.warn('flashQuery: suggestions could not be saved', error),
    )
  })
}
