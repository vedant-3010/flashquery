// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { columnHistogram, MAX_BINS } from './histogram'

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`
    CREATE TABLE t AS
    SELECT i AS n, i * 1.5 AS d, i % 5 AS level, DATE '2024-01-01' + CAST(i AS INTEGER) AS day,
           7 AS constant, 'x' AS label, CAST(NULL AS DOUBLE) AS empty
    FROM range(100) r(i)`)
})

const sum = (bins: { count: number }[]) => bins.reduce((total, bin) => total + bin.count, 0)

describe('columnHistogram (F-PROF-06)', () => {
  it('bins numbers into equal-width bins that cover every value', async () => {
    const histogram = await columnHistogram(engine, 't', { name: 'd', type: 'DECIMAL(18,1)' })
    expect(histogram?.kind).toBe('number')
    expect(histogram?.bins).toHaveLength(MAX_BINS)
    expect(sum(histogram?.bins ?? [])).toBe(100)
    expect(histogram?.bins[0]?.from).toBe(0)
    expect(histogram?.bins.at(-1)?.to).toBeCloseTo(148.5)
  })

  it('gives small-range integers one bin per value', async () => {
    const histogram = await columnHistogram(engine, 't', { name: 'level', type: 'BIGINT' })
    expect(histogram?.bins.map((bin) => bin.count)).toEqual([20, 20, 20, 20, 20])
  })

  it('bins dates on epoch milliseconds and handles constant and empty columns', async () => {
    const days = await columnHistogram(engine, 't', { name: 'day', type: 'DATE' })
    expect(days?.kind).toBe('date')
    expect(days?.bins[0]?.from).toBe(Date.UTC(2024, 0, 1))
    expect(sum(days?.bins ?? [])).toBe(100)
    const constant = await columnHistogram(engine, 't', { name: 'constant', type: 'INTEGER' })
    expect(constant?.bins).toEqual([{ from: 7, to: 7, count: 100 }])
    expect(await columnHistogram(engine, 't', { name: 'empty', type: 'DOUBLE' })).toBeNull()
    expect(await columnHistogram(engine, 't', { name: 'label', type: 'VARCHAR' })).toBeNull()
  })
})
