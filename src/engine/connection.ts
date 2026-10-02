import type { Table } from 'apache-arrow'
import { z } from '@/lib/zod'
import { AppError } from '@/lib/errors'

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
  /** Creates an empty file for COPY ... TO to write into (in memory in the browser). */
  createFile(name: string): Promise<void>
  /** Contents of a DuckDB virtual file, e.g. one written by COPY ... TO. */
  readFile(name: string): Promise<Uint8Array>
  dropFile(name: string): Promise<void>
  terminate(): Promise<void>
}

const JsonErrorSchema = z.object({ exception_type: z.string(), exception_message: z.string() })

/**
 * DuckDB's error text. The browser build sometimes reports errors as JSON
 * ({"exception_type":"Parser","exception_message":"syntax error at…"}); the Node build as plain text
 * ("Parser Error: syntax error at…"). Both become the plain form.
 */
export function duckdbErrorText(raw: string): string {
  if (!raw.trimStart().startsWith('{')) return raw
  try {
    const parsed = JsonErrorSchema.safeParse(JSON.parse(raw))
    if (parsed.success) {
      return `${parsed.data.exception_type} Error: ${parsed.data.exception_message}`
    }
  } catch {
    // Not JSON after all: show it as it is.
  }
  return raw
}

/** Wraps a DuckDB error: the first line is readable enough to show, the rest goes to "Show details". */
export function duckdbError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const text = duckdbErrorText(error instanceof Error ? error.message : String(error))
  const firstLine = text.split('\n', 1)[0]?.trim() || 'DuckDB reported an error.'
  return new AppError({ code: 'duckdb', message: firstLine, detail: text })
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
