import { beforeEach, describe, expect, it } from 'vitest'
import { toJsonl, useFeedbackStore } from './feedback'

// F-ASK-14: ratings per answer, eval cases exported in the evals/questions.jsonl shape.

beforeEach(() => useFeedbackStore.setState({ ratings: {}, cases: [] }))

describe('feedback', () => {
  it('rates answers and clears a rating', () => {
    const { rate } = useFeedbackStore.getState()
    rate('a1', 'up')
    rate('a2', 'down')
    rate('a1', null)
    expect(useFeedbackStore.getState().ratings).toEqual({ a2: 'down' })
  })

  it('exports saved cases as JSON Lines in the evals format', () => {
    const { saveCase } = useFeedbackStore.getState()
    saveCase({
      dataset: 'global_sales',
      fileName: null,
      schemaHash: 'abc',
      question: 'Which region grew fastest?',
      referenceSql: 'SELECT 1',
      generatedSql: 'SELECT 2',
      rating: 'down',
      problem: 'numbers',
      notes: 'Compared the wrong years',
    })
    saveCase({
      dataset: 'global_sales',
      fileName: null,
      schemaHash: 'abc',
      question: 'Total revenue',
      referenceSql: 'SELECT sum(revenue) FROM global_sales',
      generatedSql: null,
      rating: 'up',
      problem: null,
      notes: null,
    })
    const lines = toJsonl(useFeedbackStore.getState().cases)
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      dataset: 'global_sales',
      question: 'Total revenue',
      reference_sql: 'SELECT sum(revenue) FROM global_sales',
      notes: null,
    })
    expect(lines[1]).toMatchObject({
      reference_sql: 'SELECT 1',
      generated_sql: 'SELECT 2',
      notes: 'Wrong numbers: Compared the wrong years',
    })
    expect(lines[1].id).toMatch(/^case-/)
  })
})
