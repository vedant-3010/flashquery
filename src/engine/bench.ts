import type { Engine } from '@/engine/connection'
import { exportQuery } from '@/engine/export'
import { ingestCsvBytes } from '@/engine/ingest'
import { quoteIdent } from '@/engine/naming'
import { profileTable } from '@/engine/profile'
import { createGlobalSalesSql } from '@/engine/samples'
import { abortError } from '@/lib/errors'

// Benchmark (F-PERF-04, `/app/bench`): the engine half, also runnable in Node. Times generating the
// Global Sales sample, profiling it, exporting and re-ingesting it as CSV, and a fixed set of
// aggregation queries (p50/p95). The browser half (chart render, grid scroll, memory) lives in
// features/bench. Budgets are PRD §5's, which are stated for 1M rows.

export const BENCH_TABLE = 'bench_global_sales'
export const BENCH_CSV_TABLE = 'bench_global_sales_csv'
const t = quoteIdent(BENCH_TABLE)

export const BENCH_QUERIES = [
  `SELECT region, sum(revenue) AS revenue FROM ${t} GROUP BY ALL ORDER BY revenue DESC`,
  `SELECT date_trunc('month', order_date) AS month, sum(revenue) AS revenue FROM ${t} GROUP BY ALL ORDER BY month`,
  `SELECT country, count(*) AS orders, avg(revenue) AS aov FROM ${t} GROUP BY ALL ORDER BY orders DESC LIMIT 10`,
  `SELECT category, year(order_date) AS year, sum(revenue - cost) AS profit FROM ${t} GROUP BY ALL`,
  `SELECT product, sum(units) AS units FROM ${t} WHERE NOT returned GROUP BY ALL ORDER BY units DESC LIMIT 10`,
]
const RUNS_PER_QUERY = 5

export interface BenchResult {
  id: string
  label: string
  /** Milliseconds (or the unit in `detail`); null when not measured. */
  value: number | null
  /** Pass when value ≤ budget; null = no budget for this metric (or not at this size). */
  budget: number | null
  detail: string | null
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank] ?? Number.NaN
}

async function timed<T>(work: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now()
  const value = await work()
  return [value, performance.now() - started]
}

/**
 * Runs the engine benchmarks on `rows` generated rows. Leaves BENCH_TABLE in place for the grid
 * scroll test; call dropBenchTables() afterwards.
 */
export async function runEngineBench(
  engine: Engine,
  {
    rows,
    onStep,
    signal,
  }: { rows: number; onStep?: (label: string) => void; signal?: AbortSignal },
): Promise<BenchResult[]> {
  const full = rows >= 1_000_000
  const check = () => {
    if (signal?.aborted) throw abortError(signal)
  }
  const results: BenchResult[] = []

  onStep?.('Generating the sample')
  await dropBenchTables(engine)
  const [, generateMs] = await timed(() =>
    engine.run(createGlobalSalesSql(rows, BENCH_TABLE), signal),
  )
  results.push({
    id: 'generate',
    label: `Generate ${rows.toLocaleString('en-US')}-row sample`,
    value: generateMs,
    budget: full ? 5_000 : null,
    detail: null,
  })
  check()

  onStep?.('Profiling')
  const [, profileMs] = await timed(() => profileTable(engine, BENCH_TABLE, signal))
  results.push({
    id: 'profile',
    label: 'Profile the table',
    value: profileMs,
    budget: full ? 3_000 : null,
    detail: null,
  })
  check()

  onStep?.('Writing and reading a CSV')
  const [csv, exportMs] = await timed(() =>
    exportQuery(engine, `SELECT * FROM ${t}`, 'csv', signal),
  )
  // Measured before ingest: registering the bytes transfers them to the worker.
  const megabytes = (csv.length / 1e6).toFixed(0)
  results.push({
    id: 'export',
    label: 'Export as CSV',
    value: exportMs,
    budget: null,
    detail: `${megabytes} MB`,
  })
  check()
  const [, ingestMs] = await timed(() => ingestCsvBytes(engine, BENCH_CSV_TABLE, csv, { signal }))
  results.push({
    id: 'ingest',
    label: `Ingest ${megabytes} MB CSV (14 columns)`,
    value: ingestMs,
    budget: full ? 15_000 : null,
    detail: null,
  })
  await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(BENCH_CSV_TABLE)}`)
  check()

  onStep?.('Running aggregation queries')
  const timings: number[] = []
  for (const sql of BENCH_QUERIES) {
    await engine.run(sql, signal) // warm-up
    for (let run = 0; run < RUNS_PER_QUERY; run += 1) {
      timings.push((await timed(() => engine.run(sql, signal)))[1])
      check()
    }
  }
  const runs = `${BENCH_QUERIES.length} queries × ${RUNS_PER_QUERY} runs`
  results.push({
    id: 'query-p50',
    label: 'Aggregation query p50',
    value: percentile(timings, 50),
    budget: null,
    detail: runs,
  })
  results.push({
    id: 'query-p95',
    label: 'Aggregation query p95',
    value: percentile(timings, 95),
    budget: full ? 500 : null,
    detail: runs,
  })
  return results
}

export async function dropBenchTables(engine: Engine): Promise<void> {
  await engine.run(`DROP TABLE IF EXISTS ${t}`)
  await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(BENCH_CSV_TABLE)}`)
}

/** Results as a Markdown table for the README (F-PERF-04). */
export function benchMarkdown(results: readonly BenchResult[], meta: string): string {
  const ms = (value: number) =>
    value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(value < 10 ? 1 : 0)} ms`
  const rows = results.map((r) => {
    const value =
      r.value === null
        ? 'n/a'
        : r.id.startsWith('memory')
          ? `${r.value.toFixed(0)} MB`
          : ms(r.value)
    const budget =
      r.budget === null ? '—' : r.id.startsWith('memory') ? `≤ ${r.budget} MB` : `≤ ${ms(r.budget)}`
    const status = r.budget === null || r.value === null ? '' : r.value <= r.budget ? '✅' : '❌'
    return `| ${r.label} | ${value}${r.detail ? ` (${r.detail})` : ''} | ${budget} | ${status} |`
  })
  return [`${meta}`, '', '| Metric | Result | Budget | |', '|---|---|---|---|', ...rows].join('\n')
}
