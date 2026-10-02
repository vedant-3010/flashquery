import { create } from 'zustand'
import { getDb } from '@/engine/duckdb'
import { closeResult, openQuery, type PagedResult } from '@/engine/paging'
import { isValidTableName, quoteIdent } from '@/engine/naming'
import { DEFAULT_TIMEOUT_MS } from '@/engine/query'
import { isCancellation, toAppError, type AppErrorData } from '@/lib/errors'
import { useHistoryStore } from '@/stores/history'
import { useUiStore } from '@/stores/ui'

// SQL scratchpad (F-EXPL-07): the user's own queries against loaded tables.

interface SqlState {
  text: string
  running: boolean
  /** The last successful result; kept while a new query runs. */
  result: PagedResult | null
  /** The SQL behind `result` (the editor text may have changed since). */
  resultSql: string | null
  error: AppErrorData | null
  elapsedMs: number | null
  setText: (text: string) => void
  run: () => Promise<void>
  cancel: () => void
  /** Switches to the SQL view with `SELECT * FROM <table>` and runs it. */
  openTable: (table: string) => void
}

let controller: AbortController | null = null

export const useSqlStore = create<SqlState>()((set, get) => ({
  text: '',
  running: false,
  result: null,
  resultSql: null,
  error: null,
  elapsedMs: null,

  setText: (text) => set({ text }),

  run: async () => {
    controller?.abort()
    const current = new AbortController()
    controller = current
    set({ running: true, error: null })
    const started = performance.now()
    try {
      const engine = await getDb()
      const signal = AbortSignal.any([current.signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
      const result = await openQuery(engine, get().text, signal)
      if (controller !== current) {
        await closeResult(engine, result)
        return
      }
      const previous = get().result
      const sql = get().text.trim()
      set({ running: false, result, resultSql: sql, elapsedMs: performance.now() - started })
      useHistoryStore.getState().add({
        kind: 'query',
        text: sql,
        sql,
        status: 'answered',
        headline: null,
        rowCount: result.rowCount,
      })
      // After the grid has switched to the new result, so no page is read from a dropped view.
      if (previous) await closeResult(engine, previous)
    } catch (error) {
      if (controller !== current) return
      const failure = isCancellation(error) ? null : toAppError(error)
      set({ running: false, error: failure?.toJSON() ?? null })
      if (failure) {
        const sql = get().text.trim()
        useHistoryStore.getState().add({
          kind: 'query',
          text: sql,
          sql,
          status: 'failed',
          headline: failure.message,
          rowCount: null,
        })
      }
    } finally {
      if (controller === current) controller = null
    }
  },

  cancel: () => {
    controller?.abort()
  },

  openTable: (table) => {
    // Our table names are keyword-safe; quote anything else.
    set({ text: `SELECT * FROM ${isValidTableName(table) ? table : quoteIdent(table)}` })
    useUiStore.getState().setView('sql')
    void get().run()
  },
}))
