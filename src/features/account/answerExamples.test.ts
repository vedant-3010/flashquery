import { describe, expect, it } from 'vitest'
import { GROWTH } from '@/landing/data'
import { ANSWER_EXAMPLES } from './answerExamples'

describe('the sign-in scene (D115)', () => {
  it('answers the demo question with the landing page’s real figures', () => {
    const growth = ANSWER_EXAMPLES[0]
    expect(growth?.question).toBe('Which region grew fastest?')
    expect(growth?.bars.map((bar) => bar.value)).toEqual(GROWTH.map((row) => row.growth))
    expect(growth?.bars.map((bar) => bar.text)).toEqual(
      GROWTH.map((row) => `+${Math.round(row.growth * 100)}%`),
    )
  })

  it('shows each answer’s bars largest first, as a ranking reads', () => {
    for (const example of ANSWER_EXAMPLES) {
      const values = example.bars.map((bar) => bar.value)
      expect(values).toEqual([...values].sort((a, b) => b - a))
    }
  })
})
