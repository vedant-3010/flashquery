import { describe, expect, it } from 'vitest'
import { keywords, overlap } from '@/ai/keywords'

describe('keywords', () => {
  it('lowercases, drops stop words and punctuation', () => {
    expect([...keywords('Which REGION grew the fastest?')]).toEqual(['region', 'grew', 'fastest'])
  })

  it('trims plurals and common endings so forms of a word meet', () => {
    expect(keywords('orders categories boxes trending')).toEqual(
      new Set(['order', 'category', 'box', 'trend']),
    )
    expect(overlap(keywords('total orders'), keywords('order totals'))).toBe(2)
  })

  it('drops bare numbers (years, counts) but keeps words with digits', () => {
    expect(keywords('Quarterly revenue in 2025, top 5, p90')).toEqual(
      new Set(['quarterly', 'revenue', 'top', 'p90']),
    )
  })

  it('keeps short words and "ss" endings whole', () => {
    expect(keywords('sales class yoy')).toEqual(new Set(['sale', 'class', 'yoy']))
  })
})
