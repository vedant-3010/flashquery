import type { Engine } from '@/engine/connection'
import { toAppError, type AppErrorData } from '@/lib/errors'

// The tab's single DuckDB instance (created lazily) and its status for the UI (F-SHELL-03).

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface EngineState {
  status: EngineStatus
  /** DuckDB version once ready, e.g. "v1.5.4". */
  version: string | null
  error: AppErrorData | null
}

let state: EngineState = { status: 'idle', version: null, error: null }
const listeners = new Set<(state: EngineState) => void>()
let current: Promise<Engine> | null = null

export function getEngineState(): EngineState {
  return state
}

export function subscribeEngine(listener: (state: EngineState) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function update(next: Partial<EngineState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener(state)
}

/** The engine, starting it on first call. Rejects with AppError `engine_init` if it can't start. */
export function getDb(): Promise<Engine> {
  if (current) return current
  update({ status: 'loading', error: null })
  const pending = import('@/engine/browser-engine')
    .then(({ createBrowserEngine }) => createBrowserEngine())
    .catch((error: unknown) => {
      throw toAppError(error, 'engine_init', "The data engine couldn't start.")
    })
  current = pending
  pending.then(
    (engine) => {
      if (current === pending) update({ status: 'ready', version: engine.version })
    },
    (error: unknown) => {
      if (current !== pending) return
      current = null
      update({ status: 'error', error: toAppError(error).toJSON() })
    },
  )
  return pending
}

/** Terminates the engine (if any) and starts a fresh one. Tables are gone; callers re-ingest. */
export async function restartDb(): Promise<Engine> {
  const previous = current
  current = null
  if (previous) {
    await previous.then(
      (engine) => engine.terminate(),
      () => undefined, // it never started; nothing to terminate
    )
  }
  return getDb()
}

/** Starts the engine when the browser is idle after first paint (PRD F-PERF-01). */
export function warmUpEngine(): () => void {
  const start = () => {
    // Failures surface through the engine status; the next getDb() call retries.
    getDb().catch(() => undefined)
  }
  // Safari has no requestIdleCallback.
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(start, { timeout: 2_000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(start, 200)
  return () => window.clearTimeout(handle)
}
