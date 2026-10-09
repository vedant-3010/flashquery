import { describe, expect, it } from 'vitest'
import { autoEffort, describeEffort } from '@/ai/effort'

const pick = (question: string, tables = 1, hasHistory = false) =>
  autoEffort(question, { tables, hasHistory })

describe('autoEffort', () => {
  it.each([
    ['Monthly retention by signup cohort', 'cohorts'],
    ['7-day rolling average of orders', 'running window'],
    ['Which region grew fastest?', 'growth'],
    ['Compare 2024 vs 2025 revenue', 'comparison'],
    ['Median delivery time by carrier', 'statistics'],
    ['Top 3 products per category', 'ranking'],
    ['What % of revenue comes from online?', 'shares'],
  ])('high for "%s" (%s)', (question, reason) => {
    expect(pick(question)).toEqual({ effort: 'high', reason })
  })

  it('low for short totals and counts', () => {
    expect(pick('How many orders are there?')).toEqual({ effort: 'low', reason: 'simple total' })
    expect(pick('Total revenue in 2025')).toMatchObject({ effort: 'low' })
  })

  it('medium otherwise, for several tables, and for follow-ups', () => {
    expect(pick('Revenue by region and channel')).toEqual({
      effort: 'medium',
      reason: 'typical question',
    })
    expect(pick('How many orders are there?', 2)).toMatchObject({ effort: 'medium' })
    expect(pick('and by month?', 1, true)).toEqual({ effort: 'medium', reason: 'follow-up' })
    // History alone doesn't make a question a follow-up.
    expect(pick('How many orders are there?', 1, true)).toMatchObject({ effort: 'low' })
  })

  it('high for long questions, and names up to two reasons', () => {
    const long = Array.from({ length: 30 }, () => 'word').join(' ')
    expect(pick(long)).toEqual({ effort: 'high', reason: 'long question' })
    expect(pick('Compare median order value growth').reason).toBe('growth, comparison')
  })

  it('describes the choice for the timeline', () => {
    expect(describeEffort({ effort: 'high', reason: 'cohorts' })).toBe('High effort: cohorts')
  })
})
