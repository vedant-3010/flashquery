// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { exportQuery } from './export'
import { ingestFile } from './ingest'
import { runQuery } from './query'

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`
    CREATE TABLE t AS
    SELECT range AS id, 'item, "' || range || '"' AS label, CAST(range / 4 AS DECIMAL(10,2)) AS amount,
           DATE '2025-01-01' + CAST(range AS INTEGER) AS day
    FROM range(3)`)
})

afterAll(() => engine.terminate())

describe('exportQuery (F-EXP-01)', () => {
  it('writes CSV with a header and proper quoting', async () => {
    const bytes = await exportQuery(engine, 'SELECT * FROM t ORDER BY id DESC;', 'csv')
    expect(new TextDecoder().decode(bytes)).toBe(
      'id,label,amount,day\n' +
        '2,"item, ""2""",0.50,2025-01-03\n' +
        '1,"item, ""1""",0.25,2025-01-02\n' +
        '0,"item, ""0""",0.00,2025-01-01\n',
    )
  })

  it('writes Parquet that keeps DuckDB types', async () => {
    const bytes = await exportQuery(engine, 'SELECT * FROM t', 'parquet')
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('PAR1')

    await ingestFile(engine, 'round_trip', new File([bytes.slice()], 'x.parquet'), 'parquet')
    const types = await runQuery(engine, 'SELECT column_type FROM (DESCRIBE round_trip)')
    expect(types.rows.flat()).toEqual(['BIGINT', 'VARCHAR', 'DECIMAL(10,2)', 'DATE'])
  })

  it('drops the file it created, even when COPY fails', async () => {
    const created: string[] = []
    const dropped: string[] = []
    const spy: Engine = {
      ...engine,
      createFile: async (name) => {
        created.push(name)
        await engine.createFile(name)
      },
      dropFile: async (name) => {
        dropped.push(name)
        await engine.dropFile(name)
      },
    }
    await exportQuery(spy, 'SELECT 1', 'csv')
    await expect(exportQuery(spy, 'SELECT nope', 'csv')).rejects.toMatchObject({ code: 'duckdb' })
    expect(dropped).toEqual(created)
    expect(created).toHaveLength(2)
  })
})
