import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  formatBytes,
  formatCompact,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from './format'

// Intl uses non-breaking and narrow spaces in some locales; compare with plain spaces.
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('formatNumber', () => {
  it.each([
    ['en-US', '1,234,567.89'],
    ['en-IN', '12,34,567.89'],
    ['de-DE', '1.234.567,89'],
  ])('groups digits for %s', (locale, expected) => {
    expect(formatNumber(1234567.891, locale)).toBe(expected)
  })

  it('respects maxFractionDigits', () => {
    expect(formatNumber(3.14159, 'en-US', { maxFractionDigits: 0 })).toBe('3')
  })

  it.each([null, undefined, Number.NaN])('renders %s as EMPTY', (value) => {
    expect(formatNumber(value, 'en-US')).toBe(EMPTY)
  })
})

describe('formatCompact', () => {
  it('uses K/M in en-US', () => {
    expect(formatCompact(1234567, 'en-US')).toBe('1.2M')
    expect(formatCompact(-4200, 'en-US')).toBe('-4.2K')
    expect(formatCompact(950, 'en-US')).toBe('950')
  })

  it('uses lakh/crore in en-IN', () => {
    expect(formatCompact(1234567, 'en-IN')).toBe('12.3L')
    expect(formatCompact(123456789, 'en-IN')).toBe('12.3Cr')
  })
})

describe('formatCurrency', () => {
  it('formats per locale and currency', () => {
    expect(formatCurrency(1234.5, 'USD', 'en-US')).toBe('$1,234.50')
    expect(formatCurrency(1234567.5, 'INR', 'en-IN')).toBe('₹12,34,567.50')
    expect(plain(formatCurrency(1234.5, 'EUR', 'de-DE'))).toBe('1.234,50 €')
  })

  it('supports compact notation', () => {
    expect(formatCurrency(1234567, 'USD', 'en-US', { compact: true })).toBe('$1.2M')
    expect(formatCurrency(12345678, 'INR', 'en-IN', { compact: true })).toBe('₹1.2Cr')
  })

  it('renders missing values as EMPTY', () => {
    expect(formatCurrency(null, 'USD', 'en-US')).toBe(EMPTY)
  })
})

describe('formatPercent', () => {
  it('treats the value as a fraction', () => {
    expect(formatPercent(0.1234, 'en-US')).toBe('12.3%')
    expect(formatPercent(1.42, 'en-US')).toBe('142%')
    expect(plain(formatPercent(0.5, 'de-DE'))).toBe('50 %')
  })
})

describe('formatDate / formatDateTime', () => {
  it('formats ISO dates per locale', () => {
    expect(formatDate('2025-03-01', 'en-US')).toBe('Mar 1, 2025')
    expect(formatDate('2025-03-01', 'en-IN')).toBe('1 Mar 2025')
    expect(formatDate('2025-03-01', 'de-DE')).toBe('01.03.2025')
  })

  it('keeps wall-clock values in UTC so dates never shift by a day', () => {
    expect(formatDate('2025-12-31 23:30:00', 'en-US')).toBe('Dec 31, 2025')
    expect(plain(formatDateTime('2025-03-01 14:05:00', 'en-US'))).toBe('Mar 1, 2025, 2:05 PM')
    expect(formatDateTime('2025-03-01T14:05:00', 'en-GB')).toBe('1 Mar 2025, 14:05')
  })

  it('converts zoned timestamps to UTC', () => {
    expect(plain(formatDateTime('2025-03-01T14:05:00+05:30', 'en-US'))).toBe('Mar 1, 2025, 8:35 AM')
  })

  it('shows unparseable input as-is and missing input as EMPTY', () => {
    expect(formatDate('not a date', 'en-US')).toBe('not a date')
    expect(formatDate(null, 'en-US')).toBe(EMPTY)
  })
})

describe('formatDuration', () => {
  it.each([
    [84, '84 ms'],
    [999.4, '999 ms'],
    [999.6, '1 s'],
    [1830, '1.8 s'],
    [59940, '59.9 s'],
    [59960, '1 min'],
    [125000, '2 min 5 s'],
  ])('%d ms → %s', (ms, expected) => {
    expect(formatDuration(ms, 'en-US')).toBe(expected)
  })

  it('uses the locale decimal separator', () => {
    expect(formatDuration(1830, 'de-DE')).toBe('1,8 s')
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1000, '1 KB'],
    [1500, '1.5 KB'],
    [110_400_000, '110.4 MB'],
    [2.5e9, '2.5 GB'],
  ])('%d → %s', (bytes, expected) => {
    expect(formatBytes(bytes, 'en-US')).toBe(expected)
  })
})
