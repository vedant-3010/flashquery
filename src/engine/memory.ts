import { z } from '@/lib/zod'
import type { SqlRunner } from '@/engine/connection'
import { numberLike, tableToObjects } from '@/engine/normalize'

// Engine memory indicator (F-PERF-05): what DuckDB holds in memory, from duckdb_memory(), largest
// consumers first. Temporary storage is what spilled to its (in-browser) temp files.

export interface EngineMemory {
  totalBytes: number
  temporaryBytes: number
  /** The largest consumers (e.g. BASE_TABLE, HASH_TABLE), at most 4. */
  top: { tag: string; bytes: number }[]
}

const RowSchema = z.object({ tag: z.string(), bytes: numberLike, temporary: numberLike })

export async function engineMemory(runner: SqlRunner, signal?: AbortSignal): Promise<EngineMemory> {
  const rows = tableToObjects(
    await runner.run(
      `SELECT tag, memory_usage_bytes AS bytes, temporary_storage_bytes AS temporary
       FROM duckdb_memory() ORDER BY memory_usage_bytes DESC`,
      signal,
    ),
    RowSchema,
  )
  return {
    totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    temporaryBytes: rows.reduce((sum, row) => sum + row.temporary, 0),
    top: rows
      .filter((row) => row.bytes > 0)
      .slice(0, 4)
      .map((row) => ({ tag: row.tag, bytes: row.bytes })),
  }
}
