// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Engine } from '@/engine/connection'
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

  it('has the 11 PRD questions with unique normalized texts', () => {
    expect(DEMO_FIXTURES).toHaveLength(11)
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
      // The chart hint refers to real result columns.
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
