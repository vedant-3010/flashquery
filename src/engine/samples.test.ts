// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import { runQuery } from './query'
import { createGlobalSalesSql } from './samples'

let engine: Engine

async function rows(sql: string) {
  return (await runQuery(engine, sql)).rows
}

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(100_000))
})

describe('Global Sales generator', () => {
  it('has the PRD columns and types', async () => {
    expect(await rows(`SELECT column_name, column_type FROM (DESCRIBE global_sales)`)).toEqual([
      ['order_id', 'BIGINT'],
      ['order_date', 'DATE'],
      ['region', 'VARCHAR'],
      ['country', 'VARCHAR'],
      ['channel', 'VARCHAR'],
      ['category', 'VARCHAR'],
      ['product', 'VARCHAR'],
      ['customer_segment', 'VARCHAR'],
      ['units', 'INTEGER'],
      ['unit_price', 'DOUBLE'],
      ['discount', 'DOUBLE'],
      ['revenue', 'DOUBLE'],
      ['cost', 'DOUBLE'],
      ['returned', 'BOOLEAN'],
    ])
  })

  it('is deterministic', async () => {
    const checksum = `SELECT count(*), sum(hash(COLUMNS(*))) FROM global_sales`
    const first = await rows(checksum)
    await engine.run(createGlobalSalesSql(100_000))
    expect(await rows(checksum)).toEqual(first)
  })

  it('stays within the documented ranges', async () => {
    const [stats] = await rows(`
      SELECT count(*), min(order_id), max(order_id), min(order_date), max(order_date),
             min(units), max(units), min(unit_price), max(unit_price), min(discount), max(discount),
             count(DISTINCT region), count(DISTINCT country), count(DISTINCT product),
             bool_and(abs(revenue - round(units * unit_price * (1 - discount), 2)) < 0.01),
             bool_and(cost BETWEEN revenue * 0.51 AND revenue * 0.84)
      FROM global_sales`)
    expect(stats).toEqual([
      100_000,
      1,
      100_000,
      '2022-01-01',
      '2025-12-31',
      1,
      20,
      5,
      1499,
      0,
      0.3,
      5,
      19,
      25,
      true,
      true,
    ])
  })

  it('orders order_id by date', async () => {
    const [[outOfOrder]] = await rows(`
      SELECT count(*) FROM (
        SELECT order_date < lag(order_date) OVER (ORDER BY order_id) AS back FROM global_sales
      ) WHERE back`)
    expect(outOfOrder).toBe(0)
  })

  it('makes APAC the fastest-growing region, then LATAM', async () => {
    const growth = await rows(`
      SELECT region,
             sum(revenue) FILTER (WHERE year(order_date) = 2025) / sum(revenue) FILTER (WHERE year(order_date) = 2022) - 1 AS g
      FROM global_sales GROUP BY region ORDER BY g DESC`)
    expect(growth.map(([region]) => region)).toEqual([
      'APAC',
      'LATAM',
      'MEA',
      'Europe',
      'North America',
    ])
    expect(growth[0]?.[1]).toBeGreaterThan(1.2)
  })

  it('adds Q4 volume for Electronics and Apparel only', async () => {
    const [[electronics, home]] = await rows(`
      SELECT count(*) FILTER (WHERE category = 'Electronics' AND quarter(order_date) = 4)
               / (count(*) FILTER (WHERE category = 'Electronics' AND quarter(order_date) = 1)),
             count(*) FILTER (WHERE category = 'Home' AND quarter(order_date) = 4)
               / (count(*) FILTER (WHERE category = 'Home' AND quarter(order_date) = 1))
      FROM global_sales`)
    // +25% uplift: Q4/Q1 ≈ 1.25 for uplifted categories, ≈ 1 otherwise.
    expect(electronics).toBeGreaterThan(1.18)
    expect(home).toBeLessThan(1.08)
  })

  it('returns about 4% of orders, Apparel the most', async () => {
    const [[overall, apparel]] = await rows(`
      SELECT avg(returned::INT), avg(returned::INT) FILTER (WHERE category = 'Apparel') FROM global_sales`)
    expect(overall).toBeGreaterThan(0.03)
    expect(overall).toBeLessThan(0.05)
    expect(apparel).toBeGreaterThan(0.07)
  })

  // Timing is logged, not asserted (see profile.test.ts).
  it('generates 1M rows', { timeout: 60_000 }, async () => {
    const started = performance.now()
    await engine.run(createGlobalSalesSql(1_000_000))
    const elapsed = performance.now() - started
    console.info(`global_sales 1M rows generated in ${Math.round(elapsed)} ms (Node)`)
    expect(await rows('SELECT count(*) FROM global_sales')).toEqual([[1_000_000]])
  })
})
