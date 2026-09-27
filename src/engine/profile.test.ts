// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { profileTable, schemaHash } from './profile'
import { createGlobalSalesSql } from './samples'

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(10_000))
  await engine.run(`
    CREATE TABLE people AS
    SELECT i AS id,
           CASE WHEN i % 10 = 0 THEN NULL ELSE ['red', 'green', 'blue'][1 + i % 3] END AS colour,
           i * 2.5 AS score,
           repeat('x', 200) || i AS note
    FROM range(100) r(i)`)
})

describe('profileTable', () => {
  it('profiles every column with stats, top values and a role', async () => {
    const profile = await profileTable(engine, 'people')
    expect(profile.rowCount).toBe(100)
    const [id, colour, score, note] = profile.columns

    expect(id).toMatchObject({
      name: 'id',
      type: 'BIGINT',
      role: 'id',
      min: 0,
      max: 99,
      nullPct: 0,
    })
    expect(colour).toMatchObject({ role: 'category', nullPct: 10 })
    expect(colour?.topValues.map((t) => t.value)).toEqual(['blue', 'green', 'red', null])
    expect(colour?.topValues[0]?.count).toBe(30)
    expect(score).toMatchObject({ role: 'measure', min: 0, max: 247.5, mean: 123.75 })
    expect(score?.quartiles).toHaveLength(3)
    expect(note?.role).toBe('text')
    expect(note?.min).toHaveLength(120)
    expect(note?.topValues).toEqual([])
  })

  it('infers the Global Sales roles', async () => {
    const profile = await profileTable(engine, 'global_sales')
    expect(Object.fromEntries(profile.columns.map((c) => [c.name, c.role]))).toEqual({
      order_id: 'id',
      order_date: 'time',
      region: 'geo',
      country: 'geo',
      channel: 'category',
      category: 'category',
      product: 'category',
      customer_segment: 'category',
      units: 'measure',
      unit_price: 'measure',
      discount: 'measure',
      revenue: 'measure',
      cost: 'measure',
      returned: 'boolean',
    })
    // Small counts are exact (approx_unique alone reports 4 regions).
    expect(profile.columns.find((c) => c.name === 'region')?.approxDistinct).toBe(5)
    expect(profile.columns.find((c) => c.name === 'country')?.approxDistinct).toBe(19)
    const orderDate = profile.columns.find((c) => c.name === 'order_date')
    expect(orderDate).toMatchObject({ min: '2022-01-01', max: '2025-12-31', mean: null })
  })

  it('profiles 1M rows within budget', async () => {
    await engine.run(createGlobalSalesSql(1_000_000))
    const started = performance.now()
    await profileTable(engine, 'global_sales')
    const elapsed = performance.now() - started
    console.info(`profiled 1M rows in ${Math.round(elapsed)} ms (Node)`)
    expect(elapsed).toBeLessThan(3_000)
  })
})

describe('schemaHash', () => {
  it('is stable and sensitive to names, types and order', () => {
    const base = [
      { name: 'a', type: 'BIGINT' },
      { name: 'b', type: 'VARCHAR' },
    ]
    expect(schemaHash(base)).toBe(schemaHash([...base]))
    expect(schemaHash(base)).toMatch(/^[0-9a-f]{8}$/)
    expect(schemaHash([base[1]!, base[0]!])).not.toBe(schemaHash(base))
    expect(schemaHash([{ name: 'a', type: 'DOUBLE' }, base[1]!])).not.toBe(schemaHash(base))
  })
})
