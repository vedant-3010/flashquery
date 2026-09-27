import { z } from 'zod'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent } from '@/engine/naming'
import { numberLike, tableToObjects, toLogicalType } from '@/engine/normalize'
import { CATEGORY_MAX_DISTINCT, inferRole } from '@/engine/roles'
import type { ColumnProfile } from '@/engine/types'

// F-PROF-02: row count + SUMMARIZE + top values in three queries, then role inference.

const TOP_VALUE_COUNT = 5
/** Long text in min/max/top values is clipped; it's for display and AI context, not analysis. */
const MAX_TEXT = 120

const SummarizeRowSchema = z.object({
  column_name: z.string(),
  column_type: z.string(),
  min: z.string().nullable(),
  max: z.string().nullable(),
  approx_unique: numberLike,
  avg: z.string().nullable(),
  q25: z.string().nullable(),
  q50: z.string().nullable(),
  q75: z.string().nullable(),
  null_percentage: z
    .number()
    .nullable()
    .transform((value) => value ?? 0),
})
type SummarizeRow = z.infer<typeof SummarizeRowSchema>

const TopValueRowSchema = z.object({ col: numberLike, value: z.string().nullable(), n: numberLike })

export interface TableProfile {
  rowCount: number
  columns: ColumnProfile[]
  schemaHash: string
}

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text)

function toNumber(text: string | null): number | null {
  if (text === null) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** FNV-1a (32-bit, hex) of ordered `name:type` pairs. Stable across sessions and devices. */
export function schemaHash(columns: { name: string; type: string }[]): string {
  let hash = 0x811c9dc5
  const text = columns.map((column) => `${column.name}:${column.type}`).join('\n')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

async function topValues(
  runner: SqlRunner,
  table: string,
  columns: string[],
  signal?: AbortSignal,
): Promise<Map<string, ColumnProfile['topValues']>> {
  const result = new Map<string, ColumnProfile['topValues']>()
  if (columns.length === 0) return result
  const parts = columns.map(
    (name, index) =>
      `(SELECT ${index} AS col, CAST(${quoteIdent(name)} AS VARCHAR) AS value, count(*) AS n ` +
      `FROM ${quoteIdent(table)} GROUP BY ALL ORDER BY n DESC, value NULLS LAST LIMIT ${TOP_VALUE_COUNT})`,
  )
  const rows = tableToObjects(
    await runner.run(parts.join('\nUNION ALL\n'), signal),
    TopValueRowSchema,
  )
  for (const row of rows) {
    const name = columns[row.col]
    if (name === undefined) continue
    const list = result.get(name) ?? []
    list.push({ value: row.value === null ? null : clip(row.value), count: row.n })
    result.set(name, list)
  }
  for (const list of result.values()) list.sort((a, b) => b.count - a.count)
  return result
}

/** Below this approximate count, distinct values are counted exactly (cheap, and visible to users). */
export const EXACT_DISTINCT_LIMIT = 2 * CATEGORY_MAX_DISTINCT

/**
 * approx_unique (HyperLogLog) is visibly wrong for small counts ("≈ 4" regions next to 5 top values),
 * so low-cardinality columns get an exact count(DISTINCT) in one extra scan. Mutates `summary`.
 */
async function exactSmallCounts(
  runner: SqlRunner,
  table: string,
  summary: SummarizeRow[],
  signal?: AbortSignal,
): Promise<void> {
  const small = summary.filter(
    (row) =>
      row.approx_unique <= EXACT_DISTINCT_LIMIT && toLogicalType(row.column_type) !== 'other',
  )
  if (small.length === 0) return
  const counts = small.map((row, i) => `count(DISTINCT ${quoteIdent(row.column_name)}) AS c${i}`)
  const [exact] = tableToObjects(
    await runner.run(`SELECT ${counts.join(', ')} FROM ${quoteIdent(table)}`, signal),
    z.record(z.string(), numberLike),
  )
  small.forEach((row, i) => {
    const value = exact?.[`c${i}`]
    if (value !== undefined) row.approx_unique = value
  })
}

function toColumnProfile(
  row: SummarizeRow,
  rowCount: number,
  top: ColumnProfile['topValues'],
): ColumnProfile {
  const logical = toLogicalType(row.column_type)
  const numeric = logical === 'integer' || logical === 'number'
  const bound = (text: string | null) =>
    numeric ? toNumber(text) : text === null ? null : clip(text)
  const [q25, q50, q75] = [row.q25, row.q50, row.q75].map(toNumber)
  return {
    name: row.column_name,
    type: row.column_type,
    role: inferRole({
      name: row.column_name,
      type: row.column_type,
      approxDistinct: row.approx_unique,
      rowCount,
      nullPct: row.null_percentage,
    }),
    nullPct: row.null_percentage,
    approxDistinct: row.approx_unique,
    min: bound(row.min),
    max: bound(row.max),
    mean: numeric ? toNumber(row.avg) : null,
    quartiles: numeric && q25 != null && q50 != null && q75 != null ? [q25, q50, q75] : null,
    topValues: top,
    description: null,
    unit: null,
  }
}

export async function profileTable(
  runner: SqlRunner,
  table: string,
  signal?: AbortSignal,
): Promise<TableProfile> {
  const id = quoteIdent(table)
  const [count] = tableToObjects(
    await runner.run(`SELECT count(*) AS n FROM ${id}`, signal),
    z.object({ n: numberLike }),
  )
  const rowCount = count?.n ?? 0
  // null_percentage is a DECIMAL (an Arrow object in JS); cast it in SQL.
  const summary = tableToObjects(
    await runner.run(
      `SELECT * REPLACE (CAST(null_percentage AS DOUBLE) AS null_percentage) FROM (SUMMARIZE ${id})`,
      signal,
    ),
    SummarizeRowSchema,
  )
  await exactSmallCounts(runner, table, summary, signal)
  const lowCardinality = summary
    .filter(
      (row) =>
        row.approx_unique <= CATEGORY_MAX_DISTINCT && toLogicalType(row.column_type) !== 'other',
    )
    .map((row) => row.column_name)
  const top = await topValues(runner, table, lowCardinality, signal)
  const columns = summary.map((row) =>
    toColumnProfile(row, rowCount, top.get(row.column_name) ?? []),
  )
  return { rowCount, columns, schemaHash: schemaHash(columns) }
}
