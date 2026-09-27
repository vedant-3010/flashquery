import { create } from 'zustand'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

interface EngineState {
  status: EngineStatus
  /** DuckDB version once the engine is ready. */
  version: string | null
}

// Driven by src/engine/duckdb.ts from M1 (F-SHELL-03).
export const useEngineStore = create<EngineState>()(() => ({
  status: 'idle',
  version: null,
}))
