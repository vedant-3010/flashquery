import { describe, expect, it } from 'vitest'
import { estimateCost, totalUsage } from './cost'

const usage = (inputTokens: number, outputTokens: number) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

describe('usage meter (F-AI-04)', () => {
  it('prices tokens from the model table', () => {
    // claude-sonnet-5: $2 in, $10 out per million tokens.
    expect(estimateCost('claude-sonnet-5', usage(1_000_000, 100_000))).toBeCloseTo(3)
    expect(estimateCost('my-custom-model', usage(10, 10))).toBeNull()
    expect(estimateCost('claude-sonnet-5', null)).toBeNull()
  })

  it('adds up a session and flags unpriced models', () => {
    expect(
      totalUsage([
        { model: 'claude-sonnet-5', usage: usage(1000, 200) },
        { model: 'claude-haiku-4-5-20251001', usage: usage(500, 100) },
        { model: 'test', usage: null },
      ]),
    ).toEqual({
      inputTokens: 1500,
      outputTokens: 300,
      cost: expect.closeTo(0.005, 6),
      partial: false,
    })
    expect(totalUsage([{ model: 'custom', usage: usage(1, 1) }])).toMatchObject({
      cost: null,
      partial: true,
    })
  })
})
