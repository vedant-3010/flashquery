// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { selectChart } from '@/charts/select'
import { createTestEngine } from '@/test/duckdb'
import { loadChartData, niceStep, readChartRows } from './chartData'
import type { Engine } from './connection'
import { closeResult, openQuery } from './paging'

// F-VIZ-05: charts never get more than 5,000 points; big results are reduced in DuckDB.

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`
    CREATE TABLE big AS
    SELECT range AS id,
           TIMESTAMP '2025-01-01' + INTERVAL (range) MINUTE AS ts,
           (range % 97) * 1.5 AS price,
           CAST(range % 1000 AS DOUBLE) AS units,
           ['A', 'B'][1 + range % 2] AS grp
    FROM range(20000)`)
})

afterAll(() => engine.terminate())

async function chartFor(sql: string) {
  const result = await openQuery(engine, sql)
  const rows = await readChartRows(engine, result)
  const spec = selectChart({ columns: result.columns, rows, rowCount: result.rowCount })
  const data = await loadChartData(engine, result, spec, rows)
  await closeResult(engine, result)
  return { result, rows, spec, data }
}

describe('niceStep', () => {
  it.each([
    [100, 5],
    [1, 0.05],
    [37, 2],
    [2_500_000, 200_000],
    [0, 1],
  ])('span %d → step %d', (span, step) => expect(niceStep(span)).toBeCloseTo(step))
})

describe('loadChartData', () => {
  it('charts small results whole', async () => {
    const { data, spec } = await chartFor(
      'SELECT grp, count(*) AS n FROM big GROUP BY grp ORDER BY grp',
    )
    expect(spec.type).toBe('bar')
    expect(data).toMatchObject({
      sampling: 'none',
      rowCount: 2,
      rows: [
        ['A', 10000],
        ['B', 10000],
      ],
    })
  })

  it('samples a 20k-row scatter to 5,000 points in SQL, repeatably', async () => {
    const first = await chartFor('SELECT price, units FROM big')
    expect(first.rows).toHaveLength(1000)
    expect(first.spec.type).toBe('scatter')
    expect(first.data.sampling).toBe('sample')
    expect(first.data.rows).toHaveLength(5000)
    const again = await chartFor('SELECT price, units FROM big')
    expect(again.data.rows.slice(0, 5)).toEqual(first.data.rows.slice(0, 5))
  })

  it('keeps every n-th point of a long line, in time order', async () => {
    const { data, spec } = await chartFor('SELECT ts, units FROM big')
    expect(spec.type).toBe('line')
    expect(data.sampling).toBe('step')
    expect(data.rows.length).toBeLessThanOrEqual(5000)
    expect(data.rows[0]?.[0]).toBe('2025-01-01T00:00:00')
    const times = data.rows.map((row) => String(row[0]))
    expect([...times].sort()).toEqual(times)
    // The line ends where the data does: the last minute is kept.
    expect(times.at(-1)).toBe('2025-01-14T21:19:00')
  })

  it('shows a big KPI series with its true latest value (F-VIZ-10)', async () => {
    const result = await openQuery(engine, 'SELECT ts, units FROM big')
    const rows = await readChartRows(engine, result)
    const spec = selectChart({
      columns: result.columns,
      rows,
      rowCount: result.rowCount,
      question: 'What are units right now?',
    })
    expect(spec).toMatchObject({ type: 'kpi', x: 'ts' })
    const data = await loadChartData(engine, result, spec, rows)
    await closeResult(engine, result)
    expect(data.rows.length).toBeLessThanOrEqual(5000)
    expect(data.rows.at(-1)).toEqual(['2025-01-14T21:19:00', 999])
  })

  it('computes box plot quartiles per group in DuckDB (F-VIZ-09)', async () => {
    const { spec, data } = await chartFor('SELECT grp, price FROM big')
    expect(spec).toMatchObject({ type: 'boxplot', x: 'grp', y: ['price'] })
    expect(data.sampling).toBe('quantiles')
    const [check] = await engine
      .run(
        `SELECT min(v) AS lo, quantile_cont(v, 0.25) AS q1, median(v) AS md,
                quantile_cont(v, 0.75) AS q3, max(v) AS hi
         FROM (SELECT CAST(price AS DOUBLE) AS v FROM big WHERE grp = 'A')`,
      )
      .then((table) => table.toArray().map((row) => row.toJSON()))
    const a = data.rows.find((row) => row[0] === 'A')
    expect(a?.slice(1, 6)).toEqual([check.lo, check.q1, check.md, check.q3, check.hi])
    expect(a?.[6]).toBe(10_000)
    expect(data.rows[0]?.[7]).toBe(2)
  })

  it('stops whiskers at 1.5× the box and counts the values beyond', async () => {
    const result = await openQuery(
      engine,
      `SELECT 'A' AS g, CAST(v AS DOUBLE) AS x FROM range(1, 21) t(v) UNION ALL SELECT 'A', 1000`,
    )
    const rows = await readChartRows(engine, result)
    const spec = selectChart({ columns: result.columns, rows, rowCount: result.rowCount })
    const data = await loadChartData(engine, result, spec, rows)
    await closeResult(engine, result)
    const [, low, , , , high, n, , outliers] = data.rows[0] ?? []
    expect([low, high, n, outliers]).toEqual([1, 20, 21, 1])
  })

  it('keeps the 30 biggest groups and the result order for ordered ones', async () => {
    const result = await openQuery(
      engine,
      `SELECT 'g' || lpad(CAST(id % 40 AS VARCHAR), 2, '0') AS g, price FROM big WHERE id < 4000 OR id % 40 < 10`,
    )
    const rows = await readChartRows(engine, result)
    const spec = selectChart({ columns: result.columns, rows, rowCount: result.rowCount })
    expect(spec.type).toBe('boxplot')
    const data = await loadChartData(engine, result, { ...spec, sort: 'none' }, rows)
    await closeResult(engine, result)
    expect(data.rows).toHaveLength(30)
    expect(data.rows[0]?.[7]).toBe(40)
    // g00–g09 have the most rows; in result order they come first.
    expect(data.rows.slice(0, 3).map((row) => row[0])).toEqual(['g00', 'g01', 'g02'])
  })

  it('counts histogram bins in DuckDB with round edges', async () => {
    const { data, spec } = await chartFor('SELECT price FROM big')
    expect(spec.type).toBe('histogram')
    expect(data.sampling).toBe('bins')
    expect(data.columns.map((c) => c.name)).toEqual(['bin_start', 'bin_end', 'count'])
    expect(data.rows[0]?.slice(0, 2)).toEqual([0, 10])
    expect(data.rows.reduce((sum, row) => sum + Number(row[2]), 0)).toBe(20000)
  })

  it('bins a constant column into one bin', async () => {
    const { data } = await chartFor('SELECT 7 AS v FROM big LIMIT 50')
    expect(data.rows).toEqual([[7, 7, 50]])
  })
})
