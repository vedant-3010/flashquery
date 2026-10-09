// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { EXAMPLES, pickExamples, TOY_SCHEMA } from '@/ai/examples'
import type { Engine } from '@/engine/connection'
import { runQuery } from '@/engine/query'
import { guardSql } from '@/engine/sqlGuard'
import { createTestEngine } from '@/test/duckdb'

// The example library teaches the model DuckDB: every example must pass the guard and run on the
// toy schema it is written against, or the model would learn from broken SQL.

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(`CREATE TABLE customers AS SELECT
      i::BIGINT AS customer_id,
      ['Consumer', 'Corporate', 'Small Business'][i % 3 + 1] AS segment,
      DATE '2023-06-01' + (i * 7)::INTEGER AS signup_date,
      ['US', 'DE', 'IN', 'BR'][i % 4 + 1] AS country
    FROM range(1, 60) AS t(i)`)
  await engine.run(`CREATE TABLE orders AS SELECT
      i::BIGINT AS order_id,
      DATE '2024-01-01' + (i % 730)::INTEGER AS order_date,
      (i % 59 + 1)::BIGINT AS customer_id,
      ['North', 'South', 'East', 'West'][i % 4 + 1] AS region,
      ['Online', 'Retail', 'Partner'][i % 3 + 1] AS channel,
      ['Pro Laptop', 'Monitor', 'Keyboard', 'Pro Mouse', 'Dock'][i % 5 + 1] AS product,
      (i % 7 + 1)::INTEGER AS units,
      ((i * 37) % 900 + 20)::DOUBLE AS revenue,
      ((i % 4) * 0.05)::DOUBLE AS discount
    FROM range(1, 1500) AS t(i)`)
}, 60_000)

describe('example library', () => {
  it('has about 20 examples, each with a question, SQL and tags', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(18)
    for (const example of EXAMPLES) {
      expect(example.question.length).toBeGreaterThan(5)
      expect(example.tags.length).toBeGreaterThan(2)
    }
  })

  it('describes the toy tables the SQL uses', () => {
    expect(TOY_SCHEMA).toContain('orders(')
    expect(TOY_SCHEMA).toContain('customers(')
  })

  it.each(EXAMPLES.map((example) => [example.question, example] as const))(
    '%s: passes the guard and returns rows',
    async (_, example) => {
      const sql = await guardSql(engine, example.sql, { tables: ['orders', 'customers'] })
      const result = await runQuery(engine, sql, { maxRows: 10_000 })
      expect(result.rows.length).toBeGreaterThan(0)
    },
  )
})

describe('pickExamples', () => {
  const questions = (asked: string) => pickExamples(asked).map((example) => example.question)

  it('finds the matching pattern for common question shapes', () => {
    expect(questions('What is the year over year growth of sales per country?')[0]).toBe(
      'Year-over-year revenue growth by region',
    )
    expect(questions('Top 5 customers in each segment')[0]).toBe(
      'Top 3 products in each region by revenue',
    )
    expect(questions('What percentage of sales comes from each category?')[0]).toBe(
      'What share of revenue does each channel bring in?',
    )
    expect(questions('rolling 30 day average of signups')).toContain(
      '7-day moving average of daily revenue',
    )
    expect(questions('median salary by department')[0]).toBe(
      'Median and 90th percentile order value by customer segment',
    )
  })

  it('returns at most the requested number, best first', () => {
    expect(pickExamples('monthly revenue growth trend', 2)).toHaveLength(2)
    expect(pickExamples('revenue', 5).length).toBeLessThanOrEqual(5)
  })

  it('returns nothing for a question that shares no words', () => {
    expect(pickExamples('zzz qqq')).toEqual([])
    // A year is no shape: it used to pull in every example that mentions 2025.
    expect(pickExamples('Quarterly revenue in 2025')).toEqual([])
  })
})
