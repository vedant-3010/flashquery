// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { loadDataset } from './load'

// Paste (F-DATA-10), type overrides (F-DATA-09) and a safe re-import (F-DATA-08).

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
})

const PASTED = 'city\tday\tsales\nPune\t03/01/2024\t1,200\nGoa\t25/12/2024\t800\n'

describe('loadDataset', () => {
  it('loads pasted TSV and applies type overrides', async () => {
    const dataset = await loadDataset(engine, {
      id: 'p1',
      table: 'pasted',
      label: 'Pasted data',
      input: { kind: 'paste', text: PASTED },
      overrides: [
        { column: 'day', type: 'DATE', format: '%d/%m/%Y' },
        { column: 'gone', type: 'BIGINT', format: null },
      ],
    })
    expect(dataset.rowCount).toBe(2)
    expect(dataset.source).toMatchObject({ kind: 'paste', format: 'csv' })
    expect(dataset.columns.map((c) => [c.name, c.type])).toEqual([
      ['city', 'VARCHAR'],
      ['day', 'DATE'],
      ['sales', 'VARCHAR'],
    ])
  })

  it('keeps the old table when a re-import fails, and swaps it when one succeeds', async () => {
    const failing = loadDataset(engine, {
      id: 'p1',
      table: 'pasted',
      label: 'Pasted data',
      input: { kind: 'paste', text: 'x\n1\n' },
      replace: true,
      signal: AbortSignal.abort(),
    })
    await expect(failing).rejects.toThrow()
    expect((await engine.run('SELECT count(*) AS n FROM pasted')).toArray()[0]?.n).toBe(2n)

    const replaced = await loadDataset(engine, {
      id: 'p1',
      table: 'pasted',
      label: 'Pasted data',
      input: { kind: 'paste', text: 'x\n1\n2\n3\n' },
      replace: true,
    })
    expect(replaced).toMatchObject({ table: 'pasted', rowCount: 3 })
    const tables = (
      await engine.run("SELECT table_name FROM duckdb_tables() WHERE table_name LIKE 'pasted%'")
    ).toArray()
    expect(tables.map((row) => row.table_name)).toEqual(['pasted'])
  })
})
