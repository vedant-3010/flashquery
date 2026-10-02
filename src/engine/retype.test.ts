// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { describeQuery } from './query'
import { previewRetype, retypeColumn } from './retype'

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`
    CREATE TABLE t AS SELECT * FROM (VALUES
      ('03/01/2024', '12', 'yes'), ('25/12/2024', 'n/a', 'no'), ('bad', '7', NULL), (NULL, '1.5', 'yes')
    ) v(day, amount, flag)`)
})

describe('column type override (F-DATA-09)', () => {
  it('previews how many values would fail, with examples', async () => {
    const dates = await previewRetype(engine, 't', {
      column: 'day',
      type: 'DATE',
      format: '%d/%m/%Y',
    })
    expect(dates).toEqual({ total: 3, failed: 1, examples: ['bad'] })
    // DuckDB rounds '1.5' to 2 for BIGINT; only text that isn't a number fails.
    const numbers = await previewRetype(engine, 't', {
      column: 'amount',
      type: 'BIGINT',
      format: null,
    })
    expect(numbers).toEqual({ total: 4, failed: 1, examples: ['n/a'] })
  })

  it('converts in place; failures become NULL', async () => {
    await retypeColumn(engine, 't', { column: 'day', type: 'DATE', format: '%d/%m/%Y' })
    await retypeColumn(engine, 't', { column: 'amount', type: 'DOUBLE', format: null })
    const columns = await describeQuery(engine, 'SELECT * FROM t')
    expect(columns.map((c) => c.duckType)).toEqual(['DATE', 'DOUBLE', 'VARCHAR'])
    const rows = (
      await engine.run('SELECT CAST(day AS VARCHAR) AS d, amount FROM t ORDER BY d')
    ).toArray()
    expect(rows.map((row) => [row.d, row.amount])).toEqual([
      ['2024-01-03', 12],
      ['2024-12-25', null],
      [null, 7],
      [null, 1.5],
    ])
  })
})
