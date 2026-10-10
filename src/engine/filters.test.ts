// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SALES_DEMO } from '@/ai/fixtures'
import { createTestEngine } from '@/test/duckdb'
import type { Engine } from './connection'
import {
  createFilterViews,
  cteWrapper,
  filterCondition,
  rewriteTables,
  type DashboardFilter,
} from './filters'
import { runQuery } from './query'
import { createGlobalSalesSql } from './samples'

// F-DASH-10: filters as temp views, tile SQL rewritten to read them (AST, with a CTE fallback).

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(20_000))
})

afterAll(() => engine.terminate())

const year2025: DashboardFilter = {
  kind: 'date',
  table: 'global_sales',
  column: 'order_date',
  from: '2025-01-01',
  to: '2025-12-31',
}
const apac: DashboardFilter = {
  kind: 'values',
  table: 'global_sales',
  column: 'region',
  values: ['APAC'],
}

async function value(sql: string): Promise<unknown> {
  return (await runQuery(engine, sql)).rows[0]?.[0]
}

describe('filterCondition', () => {
  it('builds quoted, typed conditions', () => {
    expect(filterCondition(year2025)).toBe(
      `CAST("order_date" AS DATE) >= DATE '2025-01-01' AND CAST("order_date" AS DATE) <= DATE '2025-12-31'`,
    )
    expect(
      filterCondition({
        kind: 'values',
        table: 't',
        column: 'name',
        values: ["O'Brien", null, 3, true],
      }),
    ).toBe(`("name" IN ('O''Brien', 3, TRUE) OR "name" IS NULL)`)
    expect(filterCondition({ ...year2025, from: null, to: null })).toBeNull()
    expect(filterCondition({ ...apac, values: [] })).toBeNull()
  })
})

describe('filtered tiles', () => {
  it('rewrites only real table references and gives the filtered answer', async () => {
    const views = await createFilterViews(engine, [year2025, apac])
    expect([...views]).toEqual([['global_sales', 'flashQuery_filtered_global_sales']])
    const sql = 'SELECT round(sum(revenue), 2) AS total FROM global_sales'
    const rewritten = await rewriteTables(engine, sql, views)
    expect(rewritten).toContain('flashQuery_filtered_global_sales')
    expect(await value(rewritten)).toEqual(
      await value(
        "SELECT round(sum(revenue), 2) FROM global_sales WHERE year(order_date) = 2025 AND region = 'APAC'",
      ),
    )
  })

  it('keeps CTEs that share a name, and leaves unfiltered tables alone', async () => {
    const views = new Map([['global_sales', 'flashQuery_filtered_global_sales']])
    const sql =
      'WITH global_sales AS (SELECT 1 AS revenue) SELECT sum(revenue) AS total FROM global_sales'
    expect(await rewriteTables(engine, sql, views)).not.toContain('flashQuery_filtered')
    expect(await rewriteTables(engine, 'SELECT 42 AS answer', views)).toBe('SELECT 42 AS answer')
  })

  it.each(SALES_DEMO.fixtures.map((f) => [f.question, f.plan.sql ?? ''] as const))(
    'runs the demo query "%s" filtered',
    async (_, sql) => {
      const views = await createFilterViews(engine, [year2025])
      const rewritten = await rewriteTables(engine, sql, views)
      expect(rewritten).toContain('flashQuery_filtered_global_sales')
      await expect(runQuery(engine, rewritten)).resolves.toBeDefined()
    },
  )

  it('falls back to a CTE wrapper that shadows the tables', async () => {
    await createFilterViews(engine, [apac])
    const wrapped = cteWrapper(
      'SELECT count(*) AS n FROM (SELECT * FROM global_sales) AS s',
      new Map([['global_sales', 'flashQuery_filtered_global_sales']]),
    )
    expect(await value(wrapped)).toEqual(
      await value("SELECT count(*) FROM global_sales WHERE region = 'APAC'"),
    )
  })
})
