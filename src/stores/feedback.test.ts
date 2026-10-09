import { beforeEach, describe, expect, it } from 'vitest'
import { toJsonl, useFeedbackStore } from './feedback'

// F-ASK-14: ratings per answer, eval cases exported in the evals/questions.jsonl shape.

beforeEach(() => useFeedbackStore.setState({ ratings: {}, liked: {}, cases: [] }))

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

  it('saves a 👍 answer as a case, and takes it back with the 👍 (F-ASK-20)', () => {
    const { like, unlike, saveCase } = useFeedbackStore.getState()
    const good = {
      dataset: 'global_sales',
      fileName: null,
      schemaHash: 'abc',
      question: 'Total revenue',
      referenceSql: 'SELECT sum(revenue) FROM global_sales',
      generatedSql: null,
      rating: 'up' as const,
      problem: null,
      notes: null,
    }
    saveCase({ ...good, question: 'Another' })
    like('a1', good)
    like('a2', null)
    expect(useFeedbackStore.getState().ratings).toEqual({ a1: 'up', a2: 'up' })
    expect(useFeedbackStore.getState().cases.map((c) => c.question)).toEqual([
      'Total revenue',
      'Another',
    ])
    unlike('a1')
    unlike('a2')
    expect(useFeedbackStore.getState()).toMatchObject({ ratings: {}, liked: {} })
    expect(useFeedbackStore.getState().cases.map((c) => c.question)).toEqual(['Another'])
    useFeedbackStore.getState().clearCases()
    expect(useFeedbackStore.getState().cases).toEqual([])
  })
})
