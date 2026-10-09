import { describe, expect, it } from 'vitest'
import { isLearned, pickLearned, type LearnedSource } from '@/ai/learned'

const source = (overrides: Partial<LearnedSource>): LearnedSource => ({
  dataset: 'sales',
  schemaHash: 'h1',
  question: 'Revenue by region',
  referenceSql: 'SELECT 1',
  generatedSql: null,
  rating: 'up',
  at: 1,
  ...overrides,
})

const tables = [{ table: 'sales', schemaHash: 'h1' }]

describe('learned examples', () => {
  it('learns from 👍 answers and corrected SQL, never from a plain 👎', () => {
    expect(isLearned(source({}))).toBe(true)
    expect(isLearned(source({ rating: 'down', generatedSql: 'SELECT 2' }))).toBe(true)
    expect(isLearned(source({ rating: 'down' }))).toBe(false)
  })

  it('uses only tables in scope whose columns have not changed', () => {
    const picked = pickLearned(
      [
        source({ question: 'revenue by region', referenceSql: 'ok' }),
        source({ question: 'revenue by region 2', dataset: 'other' }),
        source({ question: 'revenue by region 3', schemaHash: 'h2' }),
        source({ question: 'revenue by region 4', schemaHash: null }),
        source({ question: 'revenue by region 5', rating: 'down' }),
      ],
      { question: 'Revenue per region?', tables },
    )
    expect(picked).toEqual([{ question: 'revenue by region', sql: 'ok' }])
  })

  it('ranks by shared words, then newest, one per question, at most three', () => {
    const picked = pickLearned(
      [
        source({ question: 'monthly revenue', at: 1 }),
        source({ question: 'monthly revenue by region', referenceSql: 'best', at: 2 }),
        source({ question: 'Monthly revenue', referenceSql: 'newer', at: 3 }),
        source({ question: 'revenue', at: 4 }),
        source({ question: 'headcount', at: 5 }),
        source({ question: 'region list', at: 6 }),
      ],
      { question: 'Monthly revenue per region', tables },
    )
    expect(picked.map((p) => p.sql)).toEqual(['best', 'newer', 'SELECT 1'])
  })
})
