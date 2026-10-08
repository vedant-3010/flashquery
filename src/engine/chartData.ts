import { z } from '@/lib/zod'
import { CHART_POINT_LIMIT } from '@/charts/select'
import type { ChartData } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent } from '@/engine/naming'
import { normalizeExpression, tableToObjects, tableToRows } from '@/engine/normalize'
import { fetchPage, type PagedResult } from '@/engine/paging'
import type { CellValue, ColumnMeta } from '@/engine/types'

// Chart data (F-VIZ-05): charts get at most CHART_POINT_LIMIT points and nothing large is
// materialized in JS. Small results are charted whole; bigger ones are reduced in DuckDB first:
// histogram bins, a random sample for scatter plots, every n-th point for long lines. Box plots
// always get their quartiles from DuckDB (F-VIZ-09).

/** Rows read to classify a result that is too big to chart whole. */
export const ANALYZE_ROWS = 1_000
const SAMPLE_SEED = 42
const TARGET_BINS = 20
/** Box plots: at most this many groups, the ones with the most rows (build/more.ts). */
const MAX_BOX_GROUPS = 30

/** The rows chart choice looks at: all of a small result, else its first ANALYZE_ROWS. */
export function readChartRows(
  runner: SqlRunner,
  result: PagedResult,
  signal?: AbortSignal,
): Promise<CellValue[][]> {
  const limit = result.rowCount <= CHART_POINT_LIMIT ? result.rowCount : ANALYZE_ROWS
  return fetchPage(runner, result, { offset: 0, limit, sorting: [] }, signal)
}

/** A round bin width (1, 2, 2.5 or 5 × 10^k) giving about `target` bins over `span`. */
export function niceStep(span: number, target = TARGET_BINS): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const raw = span / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

const selectList = (result: PagedResult) =>
  result.columns.length > 0 ? result.columns.map(normalizeExpression).join(', ') : '*'

/** A repeatable random sample of the result, normalized like grid pages. */
export function sampleSql(result: PagedResult, size = CHART_POINT_LIMIT): string {
  return `SELECT ${selectList(result)} FROM (SELECT * FROM ${result.relation} USING SAMPLE reservoir(${size} ROWS) REPEATABLE (${SAMPLE_SEED})) AS s`
}

/**
 * Every `step`-th row along x (per series), in x order: keeps a long line's shape. The last row of
 * each series is always kept, so lines end where the data does and a KPI shows the latest value.
 */
export function everyNthSql(
  result: PagedResult,
  x: string,
  series: string | null,
  step: number,
): string {
  const partition = series ? `PARTITION BY ${quoteIdent(series)} ` : ''
  const order = quoteIdent(x)
  return (
    `SELECT ${selectList(result)} FROM (SELECT *, row_number() OVER (${partition}ORDER BY ${order}) AS flashQuery_rn, ` +
    `count(*) OVER (${partition.trimEnd()}) AS flashQuery_n FROM ${result.relation}) AS s ` +
    `WHERE (flashQuery_rn - 1) % ${step} = 0 OR flashQuery_rn = flashQuery_n ORDER BY ${order}`
  )
}

const BIN_COLUMNS: ColumnMeta[] = [
  { name: 'bin_start', duckType: 'DOUBLE', logicalType: 'number' },
  { name: 'bin_end', duckType: 'DOUBLE', logicalType: 'number' },
  { name: 'count', duckType: 'BIGINT', logicalType: 'integer' },
]

const literal = (value: number) => (Number.isFinite(value) ? String(value) : '0')

/** Histogram bins counted in DuckDB (§6 rule 9): [bin_start, bin_end, count] per bin. */
export async function histogramData(
  runner: SqlRunner,
  result: PagedResult,
  column: string,
  signal?: AbortSignal,
): Promise<ChartData> {
  const meta = result.columns.find((c) => c.name === column)
  const values = `SELECT CAST(${quoteIdent(column)} AS DOUBLE) AS v FROM ${result.relation}`
  const [range] = tableToObjects(
    await runner.run(`SELECT min(v) AS lo, max(v) AS hi, count(v) AS n FROM (${values})`, signal),
    z.object({
      lo: z.number().nullable(),
      hi: z.number().nullable(),
      n: z.union([z.number(), z.bigint()]).transform(Number),
    }),
  )
  const base = { columns: BIN_COLUMNS, rowCount: result.rowCount, sampling: 'bins' as const }
  if (!range || range.lo === null || range.hi === null) return { ...base, rows: [] }
  const { lo, hi, n } = range
  if (lo === hi) return { ...base, rows: [[lo, hi, n]] }

  let step = niceStep(hi - lo)
  if (meta?.logicalType === 'integer') step = Math.max(1, Math.round(step))
  const start = Math.floor(lo / step) * step
  const bins = Math.max(1, Math.ceil((hi - start) / step))
  const counts = tableToObjects(
    await runner.run(
      `SELECT least(CAST(floor((v - ${literal(start)}) / ${literal(step)}) AS BIGINT), ${bins - 1}) AS b, count(*) AS n ` +
        `FROM (${values}) WHERE v IS NOT NULL GROUP BY b ORDER BY b`,
      signal,
    ),
    z.object({
      b: z.union([z.number(), z.bigint()]).transform(Number),
      n: z.union([z.number(), z.bigint()]).transform(Number),
    }),
  )
  const byBin = new Map(counts.map(({ b, n: c }) => [b, c]))
  // Rounded so edges like 0.1 × 3 don't show as 0.30000000000000004.
  const edge = (i: number) => Math.round((start + i * step) * 1e9) / 1e9
  const rows = Array.from({ length: bins }, (_, i): CellValue[] => [
    edge(i),
    edge(i + 1),
    byBin.get(i) ?? 0,
  ])
  return { ...base, rows }
}

const BOX_COLUMNS: ColumnMeta[] = [
  { name: 'group', duckType: 'VARCHAR', logicalType: 'text' },
  { name: 'low', duckType: 'DOUBLE', logicalType: 'number' },
  { name: 'q1', duckType: 'DOUBLE', logicalType: 'number' },
  { name: 'median', duckType: 'DOUBLE', logicalType: 'number' },
  { name: 'q3', duckType: 'DOUBLE', logicalType: 'number' },
  { name: 'high', duckType: 'DOUBLE', logicalType: 'number' },
  { name: 'n', duckType: 'BIGINT', logicalType: 'integer' },
  { name: 'groups', duckType: 'BIGINT', logicalType: 'integer' },
  { name: 'outliers', duckType: 'BIGINT', logicalType: 'integer' },
]

/**
 * Box plot statistics computed in DuckDB (§6 rule 17): per group, the quartiles and median, Tukey
 * whiskers (the furthest values within 1.5× the box's height, so a long tail doesn't flatten the
 * box), how many values lie beyond them, and the row count, for the groups with the most rows.
 * Ordered by median (highest first), or as the groups first appear when `sort` is 'none'.
 */
export async function boxplotData(
  runner: SqlRunner,
  result: PagedResult,
  group: string,
  measure: string,
  sort: ChartSpec['sort'],
  signal?: AbortSignal,
): Promise<ChartData> {
  const sql =
    `WITH vals AS (SELECT CAST(${quoteIdent(group)} AS VARCHAR) AS g, CAST(${quoteIdent(measure)} AS DOUBLE) AS x, ` +
    `row_number() OVER () AS rn FROM ${result.relation}), ` +
    `quartiles AS (SELECT g, quantile_cont(x, 0.25) AS q1, median(x) AS median, quantile_cont(x, 0.75) AS q3, ` +
    `count(x) AS n, min(rn) AS first_seen, count(*) OVER () AS groups FROM vals WHERE x IS NOT NULL GROUP BY g), ` +
    `kept AS (SELECT *, q1 - 1.5 * (q3 - q1) AS lo_fence, q3 + 1.5 * (q3 - q1) AS hi_fence FROM quartiles ` +
    `ORDER BY n DESC, g LIMIT ${MAX_BOX_GROUPS}), ` +
    `whiskers AS (SELECT k.g, min(v.x) FILTER (WHERE v.x >= k.lo_fence) AS low, ` +
    `max(v.x) FILTER (WHERE v.x <= k.hi_fence) AS high, ` +
    `count(*) FILTER (WHERE v.x < k.lo_fence OR v.x > k.hi_fence) AS outliers ` +
    `FROM kept AS k JOIN vals AS v ON v.g IS NOT DISTINCT FROM k.g WHERE v.x IS NOT NULL GROUP BY k.g) ` +
    `SELECT k.g, w.low, k.q1, k.median, k.q3, w.high, k.n, k.groups, w.outliers FROM kept AS k ` +
    `JOIN whiskers AS w ON w.g IS NOT DISTINCT FROM k.g ORDER BY ${sort === 'none' ? 'k.first_seen' : 'k.median DESC'}`
  const rows = tableToObjects(
    await runner.run(sql, signal),
    z.object({
      g: z.string().nullable(),
      low: z.number(),
      q1: z.number(),
      median: z.number(),
      q3: z.number(),
      high: z.number(),
      n: z.union([z.number(), z.bigint()]).transform(Number),
      groups: z.union([z.number(), z.bigint()]).transform(Number),
      outliers: z.union([z.number(), z.bigint()]).transform(Number),
    }),
  )
  return {
    columns: BOX_COLUMNS,
    rows: rows.map((r): CellValue[] => [
      r.g,
      r.low,
      r.q1,
      r.median,
      r.q3,
      r.high,
      r.n,
      r.groups,
      r.outliers,
    ]),
    rowCount: result.rowCount,
    sampling: 'quantiles',
  }
}

/** A box plot of raw rows (one measure), as opposed to quartile columns already in the result. */
const rawBoxplot = (spec: ChartSpec) => spec.type === 'boxplot' && spec.y.length === 1

/**
 * The data one chart draws. `rows` are the result's first rows (readChartRows): used as-is when
 * they are the whole result; otherwise the chart's own reduced data is read from DuckDB.
 */
export async function loadChartData(
  runner: SqlRunner,
  result: PagedResult,
  spec: ChartSpec,
  rows: CellValue[][],
  signal?: AbortSignal,
): Promise<ChartData> {
  const base = { columns: result.columns, rowCount: result.rowCount }
  const column = spec.x ?? spec.y[0]
  if (spec.type === 'histogram' && column) return histogramData(runner, result, column, signal)
  if (rawBoxplot(spec) && spec.x && spec.y[0]) {
    return boxplotData(runner, result, spec.x, spec.y[0], spec.sort, signal)
  }
  if (rows.length >= result.rowCount) return { ...base, rows, sampling: 'none' }
  if (spec.type === 'scatter') {
    return {
      ...base,
      rows: tableToRows(await runner.run(sampleSql(result), signal)),
      sampling: 'sample',
    }
  }
  // Lines, and KPIs over time (their latest value and trend), keep every n-th point.
  if ((spec.type === 'line' || spec.type === 'area' || spec.type === 'kpi') && spec.x) {
    // One point is kept for the last row, so the step leaves room for it.
    const step = Math.ceil(result.rowCount / (CHART_POINT_LIMIT - 1))
    const sql = everyNthSql(result, spec.x, spec.series, step)
    return { ...base, rows: tableToRows(await runner.run(sql, signal)), sampling: 'step' }
  }
  return { ...base, rows, sampling: 'head' }
}

/** Whether switching from `current` to `next` needs new chart data (else the data is reused). */
export function needsNewData(
  current: { spec: ChartSpec; data: ChartData },
  next: ChartSpec,
): boolean {
  if (next.type === 'histogram' || current.spec.type === 'histogram') {
    return !(next.type === current.spec.type && next.x === current.spec.x)
  }
  if (rawBoxplot(next) || rawBoxplot(current.spec)) {
    return !(
      next.type === current.spec.type &&
      next.x === current.spec.x &&
      next.y[0] === current.spec.y[0] &&
      next.sort === current.spec.sort
    )
  }
  if (current.data.sampling === 'none') return false
  return (
    next.type !== current.spec.type ||
    next.x !== current.spec.x ||
    next.series !== current.spec.series
  )
}
