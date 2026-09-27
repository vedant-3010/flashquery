import { z } from 'zod'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent } from '@/engine/naming'
import {
  normalizeExpression,
  numberLike,
  tableToObjects,
  tableToRows,
  trimStatement,
} from '@/engine/normalize'
import { describeQuery } from '@/engine/query'
import type { CellValue, ColumnMeta } from '@/engine/types'
import { AppError } from '@/lib/errors'

// Tables and query results read in pages by the grid (F-GRID-01/02). A query becomes a temp view
// so paging and sorting are new SQL over it; nothing large is ever materialized in JS.
//
// Measured on 1M rows (DuckDB-WASM, M2): unsorted base tables read by rowid range in ~1 ms at any
// depth; ORDER BY + LIMIT/OFFSET costs ~50 ms near the top and ~200 ms deep down. Both run in the
// DuckDB worker, so the UI stays responsive; the grid shows skeleton rows meanwhile.

export const PAGE_SIZE = 200

export interface SortSpec {
  column: string
  desc: boolean
}

export interface PagedResult {
  /** Quoted relation to read from: a table or a query's temp view. */
  relation: string
  /** The temp view to drop when the result is closed (queries only). */
  viewName: string | null
  /**
   * Base tables page by rowid range when unsorted: rowids are dense (0…n-1) because tables are
   * created with CREATE TABLE AS and never modified afterwards.
   */
  byRowid: boolean
  columns: ColumnMeta[]
  rowCount: number
}

export interface PageRequest {
  offset: number
  limit: number
  sorting: SortSpec[]
}

async function countRows(runner: SqlRunner, relation: string, signal?: AbortSignal) {
  const [row] = tableToObjects(
    await runner.run(`SELECT count(*) AS n FROM ${relation}`, signal),
    z.object({ n: numberLike }),
  )
  return row?.n ?? 0
}

export async function openTable(
  runner: SqlRunner,
  table: string,
  signal?: AbortSignal,
): Promise<PagedResult> {
  const relation = quoteIdent(table)
  const columns = await describeQuery(runner, `SELECT * FROM ${relation}`, signal)
  const rowCount = await countRows(runner, relation, signal)
  return { relation, viewName: null, byRowid: true, columns, rowCount }
}

let viewCounter = 0

/**
 * Wraps a query in a temp view and counts its rows. Anything but a single query fails here:
 * the SQL is parenthesized as a subquery, so DDL or a second statement is a syntax error.
 */
export async function openQuery(
  runner: SqlRunner,
  sql: string,
  signal?: AbortSignal,
): Promise<PagedResult> {
  const body = trimStatement(sql)
  if (body === '') {
    throw new AppError({ code: 'empty_sql', message: 'Write a query to run.', detail: null })
  }
  const viewName = `result_${(viewCounter += 1)}`
  const relation = quoteIdent(viewName)
  await runner.run(
    `CREATE OR REPLACE TEMP VIEW ${relation} AS SELECT * FROM (\n${body}\n) AS q`,
    signal,
  )
  try {
    const columns = await describeQuery(runner, `SELECT * FROM ${relation}`, signal)
    const rowCount = await countRows(runner, relation, signal)
    return { relation, viewName, byRowid: false, columns, rowCount }
  } catch (error) {
    await runner.run(`DROP VIEW IF EXISTS ${relation}`)
    throw error
  }
}

export async function closeResult(runner: SqlRunner, result: PagedResult): Promise<void> {
  if (result.viewName) await runner.run(`DROP VIEW IF EXISTS ${quoteIdent(result.viewName)}`)
}

function orderBy(result: PagedResult, sorting: SortSpec[]): string {
  const keys = sorting.map(
    (sort) =>
      // Qualified, so it sorts by the stored column, not the normalized select-list alias.
      `${result.relation}.${quoteIdent(sort.column)} ${sort.desc ? 'DESC' : 'ASC'} NULLS LAST`,
  )
  // rowid breaks ties so pages never overlap or skip rows.
  if (result.byRowid && keys.length > 0) keys.push('rowid')
  return keys.length > 0 ? ` ORDER BY ${keys.join(', ')}` : ''
}

/** SQL for one page of normalized rows. */
export function pageSql(result: PagedResult, { offset, limit, sorting }: PageRequest): string {
  const start = Math.max(0, Math.floor(offset))
  const size = Math.max(0, Math.floor(limit))
  const expressions =
    result.columns.length > 0 ? result.columns.map(normalizeExpression).join(', ') : '*'
  const select = `SELECT ${expressions} FROM ${result.relation}`
  if (result.byRowid && sorting.length === 0) {
    return `${select} WHERE rowid >= ${start} AND rowid < ${start + size} ORDER BY rowid`
  }
  return `${select}${orderBy(result, sorting)} LIMIT ${size} OFFSET ${start}`
}

export async function fetchPage(
  runner: SqlRunner,
  result: PagedResult,
  request: PageRequest,
  signal?: AbortSignal,
): Promise<CellValue[][]> {
  return tableToRows(await runner.run(pageSql(result, request), signal))
}

/** All rows in the grid's order, with DuckDB's own types (for COPY ... TO). */
export function exportSql(result: PagedResult, sorting: SortSpec[]): string {
  const order = orderBy(result, sorting) || (result.byRowid ? ' ORDER BY rowid' : '')
  return `SELECT * FROM ${result.relation}${order}`
}
