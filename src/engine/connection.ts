import type { Table } from 'apache-arrow'
import { AppError, toAppError } from '@/lib/errors'

/** Runs SQL. Engine modules take this instead of a DuckDB object so they also run in Node tests. */
export interface SqlRunner {
  /** Runs one statement. Aborting `signal` cancels it inside DuckDB. */
  run(sql: string, signal?: AbortSignal): Promise<Table>
}

/** A DuckDB instance: the browser one (src/engine/browser-engine.ts) or the test one (src/test). */
export interface Engine extends SqlRunner {
  version: string
  /** Makes a File readable by name without copying it into memory. */
  registerFile(name: string, file: File): Promise<void>
  /** Makes bytes readable by name. The buffer is transferred, not copied. */
  registerBuffer(name: string, bytes: Uint8Array): Promise<void>
  /** Contents of a DuckDB virtual file, e.g. one written by COPY ... TO. */
  readFile(name: string): Promise<Uint8Array>
  dropFile(name: string): Promise<void>
  terminate(): Promise<void>
}

/** Wraps a DuckDB error: the first line is readable enough to show, the rest goes to "Show details". */
export function duckdbError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const text = error instanceof Error ? error.message : String(error)
  const firstLine = text.split('\n', 1)[0]?.trim() || 'DuckDB reported an error.'
  return toAppError(error, 'duckdb', firstLine)
}

/**
 * Runs tasks one at a time. DuckDB-WASM has no threads and a connection holds one pending query, so
 * everything that touches the engine goes through a single queue.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return (task) => {
    const result = tail.then(task, task)
    tail = result.catch(() => undefined)
    return result
  }
}
