import { z } from '@/lib/zod'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent } from '@/engine/naming'
import { numberLike, tableToObjects, toLogicalType } from '@/engine/normalize'
import type { ColumnProfile, DatasetProfile } from '@/engine/types'

// Relationship detection (F-PROF-07): join keys between loaded tables. Candidates come from names
// (the same column name, or `customer_id` next to a table `customers` with an `id`) and compatible
// types; DuckDB then checks that the values really overlap. Found joins are shown in the catalog
// and, unless the user dismisses them, sent with questions as suggestedJoins.

export interface Relationship {
  /** The many side (or either side for one-to-one). */
  from: { table: string; column: string }
  to: { table: string; column: string }
  /** Share of `from`'s distinct values found in `to` (0–1). */
  overlap: number
  kind: 'many-to-one' | 'one-to-one' | 'many-to-many'
}

export const MIN_OVERLAP = 0.5
const MAX_CANDIDATES = 24
const SAMPLE_VALUES = 20_000

const singular = (name: string) => name.replace(/(ies)$/, 'y').replace(/(s)$/, '')
const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

type Family = 'number' | 'text' | 'date' | null

function family(column: ColumnProfile): Family {
  const logical = toLogicalType(column.type)
  if (logical === 'integer') return 'number'
  if (logical === 'text') return 'text'
  if (logical === 'date') return 'date'
  return null // floats, booleans, timestamps and nested values make poor keys
}

/** Columns that could hold keys: not measures, booleans or free text. */
const keyLike = (column: ColumnProfile) =>
  family(column) !== null && ['id', 'category', 'geo', 'time'].includes(column.role)

function namesMatch(a: DatasetProfile, ca: ColumnProfile, b: DatasetProfile, cb: ColumnProfile) {
  const x = squash(ca.name)
  const y = squash(cb.name)
  if (x === y) return true
  // orders.customer_id ↔ customers.id (either direction)
  const refers = (fk: string, table: string, pk: string) =>
    pk === 'id' && (fk === `${squash(singular(table))}id` || fk === `${squash(table)}id`)
  return refers(x, b.table, y) || refers(y, a.table, x)
}

export function candidatePairs(datasets: readonly DatasetProfile[]) {
  const pairs: { a: DatasetProfile; ca: ColumnProfile; b: DatasetProfile; cb: ColumnProfile }[] = []
  datasets.forEach((a, i) => {
    for (const b of datasets.slice(i + 1)) {
      for (const ca of a.columns.filter(keyLike)) {
        for (const cb of b.columns.filter(keyLike)) {
          if (family(ca) === family(cb) && namesMatch(a, ca, b, cb)) pairs.push({ a, ca, b, cb })
        }
      }
    }
  })
  return pairs.slice(0, MAX_CANDIDATES)
}

const OverlapSchema = z.object({
  a_distinct: numberLike,
  b_distinct: numberLike,
  a_in_b: numberLike,
  b_in_a: numberLike,
  a_unique: z.boolean(),
  b_unique: z.boolean(),
})

async function measure(
  runner: SqlRunner,
  a: { table: string; column: string },
  b: { table: string; column: string },
  signal?: AbortSignal,
) {
  const values = (side: { table: string; column: string }) =>
    `SELECT DISTINCT CAST(${quoteIdent(side.column)} AS VARCHAR) AS v FROM ${quoteIdent(side.table)}
     WHERE ${quoteIdent(side.column)} IS NOT NULL LIMIT ${SAMPLE_VALUES}`
  const unique = (side: { table: string; column: string }) =>
    `(SELECT count(DISTINCT ${quoteIdent(side.column)}) = count(${quoteIdent(side.column)})
      FROM ${quoteIdent(side.table)})`
  const [row] = tableToObjects(
    await runner.run(
      `WITH a AS (${values(a)}), b AS (${values(b)})
       SELECT (SELECT count(*) FROM a) AS a_distinct,
              (SELECT count(*) FROM b) AS b_distinct,
              (SELECT count(*) FROM a SEMI JOIN b USING (v)) AS a_in_b,
              (SELECT count(*) FROM b SEMI JOIN a USING (v)) AS b_in_a,
              ${unique(a)} AS a_unique,
              ${unique(b)} AS b_unique`,
      signal,
    ),
    OverlapSchema,
  )
  return row
}

export async function detectRelationships(
  runner: SqlRunner,
  datasets: readonly DatasetProfile[],
  signal?: AbortSignal,
): Promise<Relationship[]> {
  const found: Relationship[] = []
  for (const { a, ca, b, cb } of candidatePairs(datasets)) {
    const left = { table: a.table, column: ca.name }
    const right = { table: b.table, column: cb.name }
    const m = await measure(runner, left, right, signal)
    if (!m || m.a_distinct === 0 || m.b_distinct === 0) continue
    const aShare = m.a_in_b / m.a_distinct
    const bShare = m.b_in_a / m.b_distinct
    if (Math.max(aShare, bShare) < MIN_OVERLAP || Math.max(m.a_in_b, m.b_in_a) < 2) continue
    // Point from the many side to the unique side when there is one.
    const flip = m.a_unique && !m.b_unique
    const kind =
      m.a_unique && m.b_unique
        ? 'one-to-one'
        : m.a_unique || m.b_unique
          ? 'many-to-one'
          : 'many-to-many'
    found.push({
      from: flip ? right : left,
      to: flip ? left : right,
      overlap: flip ? bShare : aShare,
      kind,
    })
  }
  return found.sort((x, y) => y.overlap - x.overlap)
}

export const relationshipId = (r: Pick<Relationship, 'from' | 'to'>) =>
  `${r.from.table}.${r.from.column}->${r.to.table}.${r.to.column}`
