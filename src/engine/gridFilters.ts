import { z } from '@/lib/zod'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent, quoteLiteral } from '@/engine/naming'
import { numberLike, tableToObjects } from '@/engine/normalize'

// Grid column filters (F-GRID-04), pushed down to DuckDB as a WHERE clause over the paged
// relation. Values are user input: every one goes in as a quoted literal or a checked number.

export type ColumnFilter =
  | { column: string; kind: 'contains'; text: string }
  | { column: string; kind: 'range'; min: number | null; max: number | null }
  /** Inclusive calendar days, YYYY-MM-DD. */
  | { column: string; kind: 'dates'; from: string | null; to: string | null }
  /** Exact values (as text); null matches NULL. */
  | { column: string; kind: 'values'; values: (string | null)[] }

const DAY = /^\d{4}-\d{2}-\d{2}$/

function condition(relation: string, filter: ColumnFilter): string | null {
  const column = `${relation}.${quoteIdent(filter.column)}`
  const text = `CAST(${column} AS VARCHAR)`
  switch (filter.kind) {
    case 'contains':
      return filter.text === ''
        ? null
        : `contains(lower(${text}), ${quoteLiteral(filter.text.toLowerCase())})`
    case 'range': {
      const parts: string[] = []
      if (filter.min !== null && Number.isFinite(filter.min))
        parts.push(`${column} >= ${filter.min}`)
      if (filter.max !== null && Number.isFinite(filter.max))
        parts.push(`${column} <= ${filter.max}`)
      return parts.length > 0 ? parts.join(' AND ') : null
    }
    case 'dates': {
      const parts: string[] = []
      const day = `CAST(${column} AS DATE)`
      if (filter.from && DAY.test(filter.from))
        parts.push(`${day} >= DATE ${quoteLiteral(filter.from)}`)
      if (filter.to && DAY.test(filter.to)) parts.push(`${day} <= DATE ${quoteLiteral(filter.to)}`)
      return parts.length > 0 ? parts.join(' AND ') : null
    }
    case 'values': {
      if (filter.values.length === 0) return null
      const values = filter.values.filter((value): value is string => value !== null)
      const parts: string[] = []
      if (values.length > 0) parts.push(`${text} IN (${values.map(quoteLiteral).join(', ')})`)
      if (values.length < filter.values.length) parts.push(`${column} IS NULL`)
      return parts.length > 1 ? `(${parts.join(' OR ')})` : (parts[0] ?? null)
    }
  }
}

/** True when the filter restricts anything (empty inputs don't). */
export function isActive(filter: ColumnFilter): boolean {
  return condition('t', filter) !== null
}

/** " WHERE …" for the active filters, or "". */
export function whereClause(relation: string, filters: readonly ColumnFilter[]): string {
  const conditions = filters
    .map((filter) => condition(relation, filter))
    .filter((c): c is string => c !== null)
  return conditions.length > 0 ? ` WHERE ${conditions.map((c) => `(${c})`).join(' AND ')}` : ''
}

/** Replaces the filter on `filter.column` (or removes it when it's inactive). */
export function setFilter(filters: readonly ColumnFilter[], filter: ColumnFilter): ColumnFilter[] {
  const others = filters.filter((f) => f.column !== filter.column)
  return isActive(filter) ? [...others, filter] : others
}

export const VALUE_LIST_LIMIT = 50

export interface ValueCount {
  value: string | null
  count: number
}

/** The most frequent values of a column (as text), for the value-list filter. */
export async function columnValues(
  runner: SqlRunner,
  relation: string,
  column: string,
  signal?: AbortSignal,
): Promise<ValueCount[]> {
  const text = `CAST(${quoteIdent(column)} AS VARCHAR)`
  return tableToObjects(
    await runner.run(
      `SELECT ${text} AS value, count(*) AS count FROM ${relation}
       GROUP BY ALL ORDER BY count DESC, value NULLS LAST LIMIT ${VALUE_LIST_LIMIT + 1}`,
      signal,
    ),
    z.object({ value: z.string().nullable(), count: numberLike }),
  )
}
