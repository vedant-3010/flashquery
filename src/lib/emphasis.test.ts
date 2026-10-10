import { describe, expect, it } from 'vitest'
import { splitNumbers } from './emphasis'

const numbers = (text: string) =>
  splitNumbers(text)
    .filter((part) => part.number)
    .map((part) => part.text)

describe('splitNumbers (D118)', () => {
  it('finds changes, shares, money and scaled figures', () => {
    expect(numbers('APAC leads with +140%, followed by LATAM (+66%).')).toEqual(['+140%', '+66%'])
    expect(numbers('Income went from 763.9K in Jan 2023 to 1.8M in Dec 2025 (+140%).')).toEqual([
      '763.9K',
      '1.8M',
      '+140%',
    ])
    expect(numbers('Harbor Health Clinics owes the most: $562,805.00.')).toEqual(['$562,805.00'])
    expect(numbers('Total revenue in 2025 was 1,234,567.')).toEqual(['1,234,567'])
  })

  it('leaves years, small counts and labels as text', () => {
    expect(numbers('5 regions compared in 2025, Q1 to Q4.')).toEqual([])
  })

  it('keeps every character, in order', () => {
    const text = 'Down -4.2% since 2024, to €1,050.50 (12 orders).'
    expect(
      splitNumbers(text)
        .map((part) => part.text)
        .join(''),
    ).toBe(text)
  })
})
