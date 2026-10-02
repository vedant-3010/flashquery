// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { fetchPage, openQuery } from './paging'
import { dropPythonResult, loadPythonResult, pythonInput } from './pythonData'
import { runQuery } from './query'

// F-PY-04: data into Python (CSV, sampled above the cap) and Python's result back into DuckDB.

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
})

afterAll(() => engine.terminate())

describe('pythonInput', () => {
  it('sends every row as CSV with date columns named', async () => {
    const input = await openQuery(
      engine,
      "SELECT DATE '2025-01-01' + CAST(range AS INTEGER) AS day, range * 1.5 AS value FROM range(3)",
    )
    const out = await pythonInput(engine, input)
    expect(new TextDecoder().decode(out.csv)).toBe(
      'day,value\n2025-01-01,0.0\n2025-01-02,1.5\n2025-01-03,3.0\n',
    )
    expect(out).toMatchObject({ rows: 3, sampled: false, dateColumns: ['day'] })
  })

  it('samples (repeatably) above the cap', async () => {
    const input = await openQuery(engine, 'SELECT range AS n FROM range(1000)')
    const first = await pythonInput(engine, input, undefined, 100)
    const again = await pythonInput(engine, input, undefined, 100)
    expect(first).toMatchObject({ rows: 100, sampled: true })
    expect(new TextDecoder().decode(first.csv).trim().split('\n')).toHaveLength(101)
    expect(first.csv).toEqual(again.csv)
  })
})

describe('loadPythonResult', () => {
  it('turns result CSV into a typed temp table, with empty cells as NULL', async () => {
    const csv = 'month,actual,forecast\n2025-11-01,10.5,\n2025-12-01,12,12\n2026-01-01,,13.25\n'
    const { table, result } = await loadPythonResult(engine, csv)
    expect(result.columns.map((c) => [c.name, c.logicalType])).toEqual([
      ['month', 'date'],
      ['actual', 'number'],
      ['forecast', 'number'],
    ])
    expect(await fetchPage(engine, result, { offset: 0, limit: 5, sorting: [] })).toEqual([
      ['2025-11-01', 10.5, null],
      ['2025-12-01', 12, 12],
      ['2026-01-01', null, 13.25],
    ])
    await dropPythonResult(engine, table)
    await expect(runQuery(engine, `SELECT * FROM ${table}`)).rejects.toThrow()
  })
})
