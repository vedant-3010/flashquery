import { z } from 'zod'
import type { SqlRunner } from '@/engine/connection'
import {
  buildNormalizedSelect,
  numberLike,
  stripTrailingSemicolons,
  tableToObjects,
  tableToRows,
  toColumnMeta,
} from '@/engine/normalize'
import type { ColumnMeta, QueryResult } from '@/engine/types'

export const DEFAULT_MAX_ROWS = 5_000
export const DEFAULT_TIMEOUT_MS = 30_000

export interface QueryOptions {
  signal?: AbortSignal
  /** Rows returned to JS; the total is still counted. */
  maxRows?: number
  timeoutMs?: number
}

const DescribeRowSchema = z.object({ column_name: z.string(), column_type: z.string() })

/**
 * Result columns of `sql`. Described through `SELECT *` so duplicate names come back the way the
 * subquery exposes them (a, a_1).
 */
export async function describeQuery(
  runner: SqlRunner,
  sql: string,
  signal?: AbortSignal,
): Promise<ColumnMeta[]> {
  const table = await runner.run(
    `DESCRIBE SELECT * FROM (\n${stripTrailingSemicolons(sql)}\n) AS q`,
    signal,
  )
  return tableToObjects(table, DescribeRowSchema).map((row) =>
    toColumnMeta(row.column_name, row.column_type),
  )
}

export async function countRows(
  runner: SqlRunner,
  sql: string,
  signal?: AbortSignal,
): Promise<number> {
  const table = await runner.run(
    `SELECT count(*) AS n FROM (\n${stripTrailingSemicolons(sql)}\n) AS q`,
    signal,
  )
  const [row] = tableToObjects(table, z.object({ n: numberLike }))
  return row?.n ?? 0
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/**
 * The one way to run a query whose result reaches the UI: describe → normalizing outer SELECT →
 * row-capped execution. Rejects with AppError (`duckdb`, `cancelled` or `timeout`).
 */
export async function runQuery(
  runner: SqlRunner,
  sql: string,
  { signal, maxRows = DEFAULT_MAX_ROWS, timeoutMs = DEFAULT_TIMEOUT_MS }: QueryOptions = {},
): Promise<QueryResult> {
  const started = performance.now()
  const combined = withTimeout(signal, timeoutMs)
  const columns = await describeQuery(runner, sql, combined)
  const table = await runner.run(buildNormalizedSelect(sql, columns, maxRows + 1), combined)
  const rows = tableToRows(table)
  const truncated = rows.length > maxRows
  if (truncated) rows.length = maxRows
  const rowCount = truncated ? await countRows(runner, sql, combined) : rows.length
  return { columns, rows, rowCount, truncated, elapsedMs: performance.now() - started }
}
