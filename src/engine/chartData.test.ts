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
