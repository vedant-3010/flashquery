// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { summarizeLocally } from '@/ai/summary'
import { selectChart } from '@/charts/select'
import type { ChartType } from '@/charts/spec'
import { loadChartData, readChartRows } from '@/engine/chartData'
import type { Engine } from '@/engine/connection'
import { closeResult, openQuery } from '@/engine/paging'
import { runQuery } from '@/engine/query'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ingestCsvBytes } from '@/engine/ingest'
import { COMPANY_FINANCES_TABLE, createGlobalSalesSql, GLOBAL_SALES_TABLE } from '@/engine/samples'
import { guardSql } from '@/engine/sqlGuard'
import { createTestEngine } from '@/test/duckdb'
import {
  DEMO_SETS,
  demoDashboard,
  demoQuestions,
  FINANCE_DEMO,
  matchFixture,
  normalizeQuestion,
  SALES_DEMO,
} from './fixtures'

// Demo answers must stay true to the samples: every fixture passes the guard, runs, and the
// headline facts hold. The finance CSV loads the way the app loads it (ingestCsvBytes).

let engine: Engine

const FIXTURES = DEMO_SETS.flatMap((set) => set.fixtures.map((fixture) => ({ set, fixture })))

beforeAll(async () => {
  engine = await createTestEngine()
  await engine.run(createGlobalSalesSql(100_000))
  const csv = fileURLToPath(new URL('../../public/samples/company_finances.csv', import.meta.url))
  await ingestCsvBytes(engine, COMPANY_FINANCES_TABLE, new Uint8Array(readFileSync(csv)))
})

afterAll(() => engine.terminate())

describe('matchFixture', () => {
  it('matches questions and aliases regardless of case and punctuation', () => {
    expect(matchFixture('Which region grew fastest?')?.title).toMatch(/growth by region/i)
    expect(matchFixture('  which REGION grew the fastest!! ')?.title).toMatch(/growth by region/i)
    expect(matchFixture('Revenue by year')?.title).toBe('Total revenue by year')
    expect(matchFixture('What is the meaning of life?')).toBeNull()
    expect(matchFixture('who owes us the most')?.title).toBe('Unpaid invoices by customer')
  })

  it('answers only about the samples that are loaded', () => {
    expect(matchFixture('Which customers owe us the most?', [GLOBAL_SALES_TABLE])).toBeNull()
    expect(
      matchFixture('Which customers owe us the most?', [COMPANY_FINANCES_TABLE]),
    ).not.toBeNull()
    expect(demoQuestions([GLOBAL_SALES_TABLE])[0]).toBe('Which region grew fastest?')
    expect(demoQuestions([COMPANY_FINANCES_TABLE])[0]).toBe(FINANCE_DEMO.fixtures[0]?.question)
    expect(demoQuestions(['my_upload'])).toEqual([])
    expect(demoDashboard(COMPANY_FINANCES_TABLE)?.title).toBe('Finance overview')
    expect(demoDashboard('my_upload')).toBeNull()
  })

  it('normalizes questions', () => {
    expect(normalizeQuestion('  Top-10 products, 2025? ')).toBe('top 10 products 2025')
  })

  it('has the 12 PRD questions, 12 finance ones, and unique normalized texts across both', () => {
    expect(SALES_DEMO.fixtures).toHaveLength(12)
    expect(SALES_DEMO.fixtures.filter((f) => f.plan.kind === 'python')).toHaveLength(1)
    expect(FINANCE_DEMO.fixtures).toHaveLength(12)
    const texts = FIXTURES.flatMap(({ fixture: f }) => [f.question, ...f.aliases]).map(
      normalizeQuestion,
    )
    expect(new Set(texts).size).toBe(texts.length)
  })
})

describe('fixture SQL', () => {
  it.each(FIXTURES.map(({ set, fixture }) => [fixture.question, fixture.plan, set.table] as const))(
    '%s passes the guard and runs',
    async (_, plan, table) => {
      const sql = await guardSql(engine, plan.sql ?? '', { tables: [table] })
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

  it.each(
    DEMO_SETS.flatMap((set) =>
      set.dashboard.tiles.map((tile) => [tile.title, tile.sql, set.table]),
    ),
  )('the demo dashboard tile "%s" passes the guard and runs', async (_, sql, table) => {
    const guarded = await guardSql(engine, sql, { tables: [table] })
    expect((await runQuery(engine, guarded)).rowCount).toBeGreaterThan(0)
  })

  it('finance: the slow payers owe the most, and the ages read in order', async () => {
    const owed = await runQuery(engine, matchFixture('Which customers owe us the most?')?.sql ?? '')
    expect(owed.rows[0]?.[0]).toBe('Harbor Health Clinics')
    const ages = await runQuery(engine, matchFixture('How old are our unpaid invoices?')?.sql ?? '')
    expect(ages.rows.map((row) => row[0])).toEqual([
      '0 days (not yet due)',
      '1-30 days late',
      '31-60 days late',
      '61-90 days late',
      '90+ days late',
    ])
    const margin = await runQuery(
      engine,
      matchFixture('What is our gross margin by quarter?')?.sql ?? '',
    )
    for (const row of margin.rows) expect(row[1]).toBeGreaterThan(0.6)
    const profit = await runQuery(
      engine,
      matchFixture('What was our net profit in 2025?')?.sql ?? '',
    )
    expect(profit.rows[0]?.[0]).toBeGreaterThan(1_000_000)
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
  // Company finances (D117)
  'How do monthly income and expenses compare?': 'line',
  'What is our net profit by quarter?': 'bar',
  'What were our top expense categories in 2025?': 'hbar',
  'Which customers owe us the most?': 'hbar',
  'How old are our unpaid invoices?': 'bar',
  'What is our gross margin by quarter?': 'line',
  'How long do customers take to pay?': 'hbar',
  'How much does each department spend?': 'bar',
  'Where does our income come from?': 'donut',
  'What was our net cash flow each month?': 'line',
  'What was our net profit in 2025?': 'kpi',
  'Which vendors did we pay the most in 2025?': 'hbar',
}

describe('fixture charts (M4)', () => {
  const SQL_FIXTURES = FIXTURES.filter(({ fixture }) => fixture.plan.kind === 'sql')

  it('covers every SQL fixture', () => {
    expect(Object.keys(EXPECTED_CHARTS).sort()).toEqual(
      SQL_FIXTURES.map(({ fixture }) => fixture.question).sort(),
    )
  })

  it.each(
    SQL_FIXTURES.map(({ set, fixture }) => [fixture.question, fixture.plan, set.table] as const),
  )('%s', async (question, plan, table) => {
    const sql = await guardSql(engine, plan.sql ?? '', { tables: [table] })
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
  })

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
