import { dataJson, TEXT_LIMIT } from '@/ai/context'
import type { Engine } from '@/engine/connection'
import { runQuery } from '@/engine/query'
import { guardSql } from '@/engine/sqlGuard'
import type { CellValue } from '@/engine/types'

// Multi-step exploration (F-ASK-15): before answering, the model may run up to 3 small queries
// (distinct values, which years exist…) and see their results. Balanced mode only, since results are
// data values; every query passes the same guard, returns at most 20 rows, and is in the trace.

export const MAX_EXPLORATIONS = 3
const MAX_ROWS = 20
const TIMEOUT_MS = 10_000

const clip = (value: CellValue): CellValue =>
  typeof value === 'string' && value.length > TEXT_LIMIT
    ? `${value.slice(0, TEXT_LIMIT - 1)}…`
    : value

export interface Exploration {
  columns: string[]
  rows: CellValue[][]
  rowCount: number
}

export async function exploreQuery(
  engine: Engine,
  sql: string,
  tables: readonly string[],
  signal: AbortSignal,
): Promise<Exploration> {
  const checked = await guardSql(engine, sql, { tables, signal })
  const result = await runQuery(engine, checked, {
    maxRows: MAX_ROWS,
    timeoutMs: TIMEOUT_MS,
    signal,
  })
  return {
    columns: result.columns.map((column) => column.name),
    rows: result.rows.map((row) => row.map(clip)),
    rowCount: result.rowCount,
  }
}

/** What the model sees back: the rows inside a data block, or why the query failed. */
export function describeExploration(
  n: number,
  outcome: { result: Exploration } | { error: string },
): string {
  if ('error' in outcome) return `Exploration ${n} failed: ${outcome.error}`
  const { result } = outcome
  const shown =
    result.rowCount > result.rows.length
      ? ` (first ${result.rows.length} of ${result.rowCount})`
      : ''
  return `Exploration ${n} returned ${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}${shown}:\n<data>\n${dataJson({ columns: result.columns, rows: result.rows })}\n</data>`
}

/** Data values in an exploration result, for the inspector's count. */
export const explorationValues = (result: Exploration) =>
  result.rows.reduce((sum, row) => sum + row.length, 0)
