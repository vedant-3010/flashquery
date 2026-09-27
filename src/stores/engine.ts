import { create } from 'zustand'
import { getEngineState, subscribeEngine, type EngineState } from '@/engine/duckdb'

export type { EngineStatus } from '@/engine/duckdb'
export type PythonStatus = 'not-loaded' | 'loading' | 'ready' | 'error'

interface EngineStoreState extends EngineState {
  /** Pyodide runtime; driven by the Python worker from M6 (F-PY-02). */
  python: PythonStatus
}

export const useEngineStore = create<EngineStoreState>()(() => ({
  ...getEngineState(),
  python: 'not-loaded',
}))

subscribeEngine((state) => useEngineStore.setState(state))
