import { describe, expect, it } from 'vitest'
import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { isTryHash } from './tryDemo'

describe('try-it deep link (PRD D99)', () => {
  it('recognizes #/try only', () => {
    expect(isTryHash('#/try')).toBe(true)
    expect(isTryHash('#/try?from=landing')).toBe(true)
    expect(isTryHash('#/bench')).toBe(false)
    expect(isTryHash('')).toBe(false)
  })

  it('asks the landing page headline question', () => {
    expect(DEMO_QUESTIONS[0]).toBe('Which region grew fastest?')
  })
})
