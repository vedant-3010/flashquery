import { create } from 'zustand'
import { getDb } from '@/engine/duckdb'
import { openTable, type PagedResult } from '@/engine/paging'
import { pythonInput } from '@/engine/pythonData'
import { isCancellation, toAppError } from '@/lib/errors'
import { useEngineStore } from '@/stores/engine'
import { useSqlStore } from '@/stores/sql'
import { currentPythonSession, runNotebookCell, startNotebook } from '@/workers/clients'
import type { NotebookCellResult } from '@/workers/notebook'

// The Python notebook in the scratchpad (F-PY-06): the user's own cells, run in order of clicking
// in one Python session, with `df` loaded from a table or the last SQL result. Kept in memory for
// this tab. Stop or a timeout resets the session (the worker is replaced), so `df` must be loaded
// again.

export interface NotebookCell {
  id: string
  code: string
  status: 'idle' | 'running' | 'done' | 'error'
  /** Execution order, like a notebook's [3]. */
  count: number | null
  result: NotebookCellResult | null
}

export type NotebookSource = { kind: 'table'; table: string } | { kind: 'result' }

interface NotebookState {
  cells: NotebookCell[]
  /** What df holds, or null before loading (or after a reset). */
  data: { label: string; rows: number; sampled: boolean; session: number } | null
  loading: string | null
  error: string | null
  running: string | null
  counter: number
  loadData: (source: NotebookSource) => Promise<void>
  setCode: (id: string, code: string) => void
  addCell: (after?: string) => void
  removeCell: (id: string) => void
  runCell: (id: string) => Promise<void>
  stop: () => void
}

let nextId = 0
const cell = (code = ''): NotebookCell => ({
  id: `cell_${(nextId += 1)}`,
  code,
  status: 'idle',
  count: null,
  result: null,
})

const FIRST_CELL = `# df holds the data you loaded. The last line's value is shown below the cell.
import matplotlib.pyplot as plt

df.describe()`

let controller: AbortController | null = null

export const useNotebookStore = create<NotebookState>()((set, get) => {
  const patch = (id: string, change: Partial<NotebookCell>) =>
    set((state) => ({ cells: state.cells.map((c) => (c.id === id ? { ...c, ...change } : c)) }))
  const sessionLost = () => {
    const data = get().data
    return data !== null && data.session !== currentPythonSession()
  }

  return {
    cells: [cell(FIRST_CELL)],
    data: null,
    loading: null,
    error: null,
    running: null,
    counter: 0,

    loadData: async (source) => {
      controller?.abort()
      const current = new AbortController()
      controller = current
      set({ loading: 'Reading the data…', error: null })
      let opened: PagedResult | null = null
      try {
        const engine = await getDb()
        const label = source.kind === 'table' ? source.table : 'the last SQL result'
        if (source.kind === 'table') opened = await openTable(engine, source.table, current.signal)
        const input = opened ?? useSqlStore.getState().result
        if (!input) throw new Error('Run a SQL query first.')
        const prepared = await pythonInput(engine, input, current.signal)
        if (useEngineStore.getState().python !== 'ready') {
          useEngineStore.setState({ python: 'loading' })
        }
        const { rows } = await startNotebook(
          { csv: prepared.csv, dateColumns: prepared.dateColumns },
          {
            signal: current.signal,
            onStatus: (message) => set({ loading: message }),
            onLoaded: () => useEngineStore.setState({ python: 'ready' }),
          },
        )
        set({
          data: { label, rows, sampled: prepared.sampled, session: currentPythonSession() },
          loading: null,
        })
      } catch (error) {
        if (useEngineStore.getState().python === 'loading') {
          useEngineStore.setState({ python: 'not-loaded' })
        }
        set({ loading: null, error: isCancellation(error) ? null : toAppError(error).message })
      } finally {
        if (controller === current) controller = null
      }
    },

    setCode: (id, code) => patch(id, { code }),

    addCell: (after) =>
      set((state) => {
        const index = after ? state.cells.findIndex((c) => c.id === after) : -1
        const cells = [...state.cells]
        cells.splice(index === -1 ? cells.length : index + 1, 0, cell())
        return { cells }
      }),

    removeCell: (id) =>
      set((state) => {
        const cells = state.cells.filter((c) => c.id !== id)
        return { cells: cells.length > 0 ? cells : [cell()] }
      }),

    runCell: async (id) => {
      const target = get().cells.find((c) => c.id === id)
      if (!target || get().running) return
      if (!get().data || sessionLost()) {
        set({
          data: null,
          error: 'Load data into df first (the Python session was reset or not started).',
        })
        return
      }
      const current = new AbortController()
      controller = current
      set({ running: id, error: null })
      patch(id, { status: 'running' })
      try {
        const result = await runNotebookCell(target.code, { signal: current.signal })
        const count = get().counter + 1
        set({ counter: count })
        patch(id, { status: result.ok ? 'done' : 'error', result, count })
      } catch (error) {
        const message = isCancellation(error)
          ? 'Stopped. The Python session was reset: load df again.'
          : toAppError(error).message
        patch(id, {
          status: 'error',
          result: { ok: false, stdout: '', error: message, value: null, figures: [] },
        })
        if (sessionLost()) set({ data: null })
      } finally {
        if (controller === current) controller = null
        set({ running: null })
      }
    },

    stop: () => controller?.abort(),
  }
})
