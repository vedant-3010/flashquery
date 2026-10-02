// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { summarizeLocally } from '@/ai/summary'
import { selectChart } from '@/charts/select'
import type { ChartType } from '@/charts/spec'
import { loadChartData, readChartRows } from '@/engine/chartData'
import type { Engine } from '@/engine/connection'
import { closeResult, openQuery } from '@/engine/paging'
import { runQuery } from '@/engine/query'
import { createGlobalSalesSql } from '@/engine/samples'
import { guardSql } from '@/engine/sqlGuard'
import { createTestEngine } from '@/test/duckdb'
import { DEMO_FIXTURES, DEMO_TABLE, matchFixture, normalizeQuestion } from './fixtures'

// Demo answers must stay true to the generated data: every fixture passes the guard, runs, and
// the headline facts hold.

let engine: Engine

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(100_000))
})

afterAll(() => engine.terminate())

describe('matchFixture', () => {
  it('matches questions and aliases regardless of case and punctuation', () => {
    expect(matchFixture('Which region grew fastest?')?.title).toMatch(/growth by region/i)
    expect(matchFixture('  which REGION grew the fastest!! ')?.title).toMatch(/growth by region/i)
    expect(matchFixture('Revenue by year')?.title).toBe('Total revenue by year')
    expect(matchFixture('What is the meaning of life?')).toBeNull()
  })

  it('normalizes questions', () => {
    expect(normalizeQuestion('  Top-10 products, 2025? ')).toBe('top 10 products 2025')
  })

  it('has the 12 PRD questions with unique normalized texts', () => {
    expect(DEMO_FIXTURES).toHaveLength(12)
    expect(DEMO_FIXTURES.filter((f) => f.plan.kind === 'python')).toHaveLength(1)
    const texts = DEMO_FIXTURES.flatMap((f) => [f.question, ...f.aliases]).map(normalizeQuestion)
    expect(new Set(texts).size).toBe(texts.length)
  })
})

describe('fixture SQL', () => {
  it.each(DEMO_FIXTURES.map((fixture) => [fixture.question, fixture.plan]))(
    '%s passes the guard and runs',
    async (_, plan) => {
      const sql = await guardSql(engine, plan.sql ?? '', { tables: [DEMO_TABLE] })
      const result = await runQuery(engine, sql)
      expect(result.rowCount).toBeGreaterThan(0)
      // The chart hint refers to real result columns (a Python plan's hint is about its result).
      if (plan.kind === 'python') return
      const names = result.columns.map((column) => column.name)
      for (const column of [plan.chartHint?.x, ...(plan.chartHint?.y ?? [])]) {
        if (column) expect(names).toContain(column)
      }
    },
  )

  it('answers the headline question: APAC grew fastest, then LATAM', async () => {
    const plan = matchFixture('Which region grew fastest?')
    const result = await runQuery(engine, plan?.sql ?? '')
    expect(result.rows.map((row) => row[0]).slice(0, 2)).toEqual(['APAC', 'LATAM'])
    expect(result.rows[0]?.[3]).toBeGreaterThan(1.2)
  })

  it('finds Apparel as the highest-margin category', async () => {
    const result = await runQuery(
      engine,
      matchFixture('Which category has the highest profit margin?')?.sql ?? '',
    )
    expect(result.rows[0]?.[0]).toBe('Apparel')
  })
})

// M4 DoD: every demo fixture renders the expected chart type.
const EXPECTED_CHARTS: Record<string, ChartType> = {
  'Which region grew fastest?': 'bar',
  'What is total revenue by year?': 'bar',
  'Show the monthly revenue trend by channel': 'line',
  'Top 10 products by revenue in 2025': 'hbar',
  'Which category has the highest profit margin?': 'bar',
  'How does discount relate to units sold?': 'scatter',
  'What share of revenue comes from each customer segment?': 'donut',
  'What is the return rate by category?': 'bar',
  'Revenue by country in APAC': 'bar',
  'What is the average order value by month?': 'line',
  'What was total revenue in 2025?': 'kpi',
}

describe('fixture charts (M4)', () => {
  const SQL_FIXTURES = DEMO_FIXTURES.filter((f) => f.plan.kind === 'sql')

  it('covers every SQL fixture', () => {
    expect(Object.keys(EXPECTED_CHARTS).sort()).toEqual(SQL_FIXTURES.map((f) => f.question).sort())
  })

  it.each(SQL_FIXTURES.map((fixture) => [fixture.question, fixture.plan] as const))(
    '%s',
    async (question, plan) => {
      const sql = await guardSql(engine, plan.sql ?? '', { tables: [DEMO_TABLE] })
      const result = await openQuery(engine, sql)
      const rows = await readChartRows(engine, result)
      const spec = selectChart({
        columns: result.columns,
        rows,
        rowCount: result.rowCount,
        question,
        hint: plan.chartHint,
        title: plan.title,
      })
      expect(spec.type).toBe(EXPECTED_CHARTS[question])
      expect(spec.reason).toMatch(/^The AI suggested a/)
      const data = await loadChartData(engine, result, spec, rows)
      const summary = summarizeLocally({
        columns: result.columns,
        rows,
        rowCount: result.rowCount,
        locale: 'en-US',
        spec,
        data,
      })
      expect(summary.headline.length).toBeGreaterThan(10)
      await closeResult(engine, result)
    },
  )

  it('keeps the headline demo summary', async () => {
    const plan = matchFixture('Which region grew fastest?')
    const result = await openQuery(engine, plan?.sql ?? '')
    const rows = await readChartRows(engine, result)
    const spec = selectChart({
      columns: result.columns,
      rows,
      rowCount: result.rowCount,
      hint: plan?.chartHint,
    })
    const data = await loadChartData(engine, result, spec, rows)
    const summary = summarizeLocally({
      columns: result.columns,
      rows,
      rowCount: result.rowCount,
      locale: 'en-US',
      spec,
      data,
    })
    expect(summary.headline).toMatch(/^APAC leads with \+\d+%, followed by LATAM \(\+\d+%\)\.$/)
  })
})
