// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { describeQuery, runQuery } from './query'

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`
    CREATE TABLE t AS
    SELECT i AS id,
           CAST(i * 1.5 AS DECIMAL(18,2)) AS amount,
           DATE '2025-01-01' + i::INTEGER AS day,
           TIMESTAMPTZ '2025-03-01 14:05:00+05:30' AS at_tz,
           [i, i + 1] AS pair,
           9007199254740993::BIGINT AS huge_id
    FROM range(10) r(i)`)
})

describe('runQuery', () => {
  it('normalizes types to plain JS values', async () => {
    const result = await runQuery(engine, 'SELECT * FROM t ORDER BY id LIMIT 2')
    expect(result.columns.map((c) => [c.name, c.logicalType])).toEqual([
      ['id', 'integer'],
      ['amount', 'number'],
      ['day', 'date'],
      ['at_tz', 'timestamp'],
      ['pair', 'other'],
      ['huge_id', 'integer'],
    ])
    expect(result.rows[1]).toEqual([
      1,
      1.5,
      '2025-01-02',
      '2025-03-01T08:35:00',
      '[1, 2]',
      '9007199254740993',
    ])
    expect(result.truncated).toBe(false)
    expect(result.rowCount).toBe(2)
  })

  it('caps rows but still reports the total', async () => {
    const result = await runQuery(engine, 'SELECT id FROM t;', { maxRows: 3 })
    expect(result.rows).toHaveLength(3)
    expect(result.truncated).toBe(true)
    expect(result.rowCount).toBe(10)
  })

  it('handles duplicate column names and trailing comments', async () => {
    const result = await runQuery(engine, 'SELECT 1 AS a, 2 AS a -- two columns')
    expect(result.columns.map((c) => c.name)).toEqual(['a', 'a_1'])
    expect(result.rows).toEqual([[1, 2]])
  })

  it('rejects with a readable AppError', async () => {
    await expect(runQuery(engine, 'SELECT nope FROM t')).rejects.toMatchObject({
      code: 'duckdb',
      message: expect.stringContaining('Binder Error'),
    })
  })

  it('honours an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runQuery(engine, 'SELECT 1', { signal: controller.signal })).rejects.toMatchObject(
      { code: 'cancelled' },
    )
  })
})

describe('describeQuery', () => {
  it('reports DuckDB types', async () => {
    const columns = await describeQuery(engine, 'SELECT amount, day FROM t')
    expect(columns).toEqual([
      { name: 'amount', duckType: 'DECIMAL(18,2)', logicalType: 'number' },
      { name: 'day', duckType: 'DATE', logicalType: 'date' },
    ])
  })
})

describe('extension lockdown (F-SEC-02)', () => {
  it('disables automatic extension install and load', async () => {
    const result = await runQuery(
      engine,
      `SELECT current_setting('autoinstall_known_extensions') AS install,
              current_setting('autoload_known_extensions') AS load`,
    )
    expect(result.rows).toEqual([[false, false]])
  })
})
