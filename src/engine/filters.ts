import { z } from 'zod'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent, quoteLiteral } from '@/engine/naming'
import { tableToRows } from '@/engine/normalize'
import { cteNames, parseSelect, walkAst } from '@/engine/sqlGuard'

// Dashboard filters (F-DASH-10): a date range and up to 3 value filters, each on one column of one
// table. Each filtered table becomes a temp view; tile SQL is rewritten to read the views instead
// of the tables: DuckDB's own syntax tree is edited (json_serialize_sql → json_deserialize_sql), so
// only real table references change. If that round trip fails, a CTE wrapper shadows the tables.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const DateFilterSchema = z.object({
  kind: z.literal('date'),
  table: z.string().min(1),
  column: z.string().min(1),
  from: z.string().regex(ISO_DATE).nullable(),
  to: z.string().regex(ISO_DATE).nullable(),
})

export const ValuesFilterSchema = z.object({
  kind: z.literal('values'),
  table: z.string().min(1),
  column: z.string().min(1),
  values: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(200),
})

export const DashboardFilterSchema = z.discriminatedUnion('kind', [
  DateFilterSchema,
  ValuesFilterSchema,
])
export type DashboardFilter = z.infer<typeof DashboardFilterSchema>

export const MAX_VALUE_FILTERS = 3

function literal(value: string | number | boolean | null): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return quoteLiteral(value)
}

/** The SQL condition for one filter, or null when it doesn't restrict anything. */
export function filterCondition(filter: DashboardFilter): string | null {
  const column = quoteIdent(filter.column)
  if (filter.kind === 'date') {
    const parts: string[] = []
    if (filter.from) parts.push(`CAST(${column} AS DATE) >= DATE ${quoteLiteral(filter.from)}`)
    if (filter.to) parts.push(`CAST(${column} AS DATE) <= DATE ${quoteLiteral(filter.to)}`)
    return parts.length > 0 ? parts.join(' AND ') : null
  }
  if (filter.values.length === 0) return null
  const nonNull = filter.values.filter((value) => value !== null)
  const parts: string[] = []
  if (nonNull.length > 0) parts.push(`${column} IN (${nonNull.map(literal).join(', ')})`)
  if (nonNull.length < filter.values.length) parts.push(`${column} IS NULL`)
  return parts.length === 1 ? (parts[0] ?? null) : `(${parts.join(' OR ')})`
}

/** Name of the filtered view for a table (a temp view; never collides with loaded tables). */
export const filteredViewName = (table: string) => `askdata_filtered_${table}`

/**
 * Creates (or replaces) one temp view per filtered table and returns table → view, for the tables
 * that have at least one active condition.
 */
export async function createFilterViews(
  runner: SqlRunner,
  filters: readonly DashboardFilter[],
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const byTable = new Map<string, string[]>()
  for (const filter of filters) {
    const condition = filterCondition(filter)
    if (!condition) continue
    const table = filter.table.toLowerCase()
    byTable.set(table, [...(byTable.get(table) ?? []), condition])
  }
  const views = new Map<string, string>()
  for (const [table, conditions] of byTable) {
    const view = filteredViewName(table)
    await runner.run(
      `CREATE OR REPLACE TEMP VIEW ${quoteIdent(view)} AS SELECT * FROM main.${quoteIdent(table)} WHERE ${conditions.join(' AND ')}`,
      signal,
    )
    views.set(table, view)
  }
  return views
}

/** `sql` reading the views instead of their tables (table → view, lower-case table names). */
export async function rewriteTables(
  runner: SqlRunner,
  sql: string,
  views: ReadonlyMap<string, string>,
  signal?: AbortSignal,
): Promise<string> {
  const { body, document, statement } = await parseSelect(runner, sql, signal)
  if (views.size === 0) return body
  const ctes = cteNames(statement)
  let changed = false
  walkAst(statement, (node) => {
    if (node.type !== 'BASE_TABLE') return
    const name = String(node.table_name ?? '').toLowerCase()
    const view = views.get(name)
    if (!view || ctes.has(name)) return
    node.table_name = view
    node.schema_name = ''
    node.catalog_name = ''
    changed = true
  })
  if (!changed) return body
  try {
    const [row] = tableToRows(
      await runner.run(
        `SELECT json_deserialize_sql(${quoteLiteral(JSON.stringify(document))})`,
        signal,
      ),
    )
    if (typeof row?.[0] === 'string' && row[0].trim() !== '') return row[0]
  } catch {
    // Fall through to the CTE wrapper.
  }
  return cteWrapper(body, views)
}

/** Fallback: CTEs named like the tables shadow them for the whole query, nested queries included. */
export function cteWrapper(sql: string, views: ReadonlyMap<string, string>): string {
  const ctes = [...views].map(
    ([table, view]) => `${quoteIdent(table)} AS (SELECT * FROM ${quoteIdent(view)})`,
  )
  return `WITH ${ctes.join(', ')} SELECT * FROM (\n${sql}\n) AS askdata_q`
}
