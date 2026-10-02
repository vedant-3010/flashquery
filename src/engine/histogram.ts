import { z } from '@/lib/zod'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent } from '@/engine/naming'
import { numberLike, tableToObjects, toLogicalType } from '@/engine/normalize'

// Mini histogram for the column profile (F-PROF-06): equal-width bins over a numeric or date
// column, computed in DuckDB when the profile opens (not during ingest). Integers with a small
// range get one bin per value. Dates and timestamps bin on epoch milliseconds.

export const MAX_BINS = 24

export interface HistogramBin {
  from: number
  to: number
  count: number
}

export interface Histogram {
  kind: 'number' | 'integer' | 'date'
  bins: HistogramBin[]
}

export function histogramKind(duckType: string): Histogram['kind'] | null {
  const logical = toLogicalType(duckType)
  if (logical === 'integer' || logical === 'number') return logical
  if (logical === 'date' || logical === 'timestamp') return 'date'
  return null
}

const RangeSchema = z.object({ lo: z.number().nullable(), hi: z.number().nullable() })
const BinSchema = z.object({ b: numberLike, n: numberLike })

export async function columnHistogram(
  runner: SqlRunner,
  table: string,
  column: { name: string; type: string },
  signal?: AbortSignal,
): Promise<Histogram | null> {
  const kind = histogramKind(column.type)
  if (!kind) return null
  const col = quoteIdent(column.name)
  const value =
    kind === 'date' ? `epoch(CAST(${col} AS TIMESTAMP)) * 1000` : `CAST(${col} AS DOUBLE)`
  const source = `SELECT ${value} AS x FROM ${quoteIdent(table)} WHERE ${col} IS NOT NULL`

  const [range] = tableToObjects(
    await runner.run(`SELECT min(x)::DOUBLE AS lo, max(x)::DOUBLE AS hi FROM (${source})`, signal),
    RangeSchema,
  )
  const lo = range?.lo ?? null
  const hi = range?.hi ?? null
  if (lo === null || hi === null || !Number.isFinite(lo) || !Number.isFinite(hi)) return null

  const bins = kind === 'integer' ? Math.max(1, Math.min(MAX_BINS, hi - lo + 1)) : MAX_BINS
  const width = hi > lo ? (hi - lo) / bins : 1
  const rows = tableToObjects(
    await runner.run(
      `SELECT least(CAST(floor((x - ${lo}) / ${width}) AS INTEGER), ${bins - 1}) AS b, count(*) AS n
       FROM (${source}) GROUP BY b ORDER BY b`,
      signal,
    ),
    BinSchema,
  )
  const counts = new Array<number>(hi > lo ? bins : 1).fill(0)
  for (const row of rows) counts[Math.max(0, Math.min(counts.length - 1, row.b))] += row.n
  return {
    kind,
    bins: counts.map((count, i) => ({
      from: lo + i * width,
      to: hi > lo ? lo + (i + 1) * width : hi,
      count,
    })),
  }
}
