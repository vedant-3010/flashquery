import { describe, expect, it } from 'vitest'
import { isValidTableName, quoteIdent, quoteLiteral, toTableName } from './naming'

describe('toTableName', () => {
  it.each([
    ['Sales Report 2025.csv', 'sales_report_2025'],
    ['monthlySales.xlsx', 'monthly_sales'],
    ['Café Orders (final).tsv', 'cafe_orders_final'],
    ['2025-q3.parquet', 't_2025_q3'],
    ['...csv', 'table'],
    ['données—été.json', 'donnees_ete'],
    ['UPPER.CSV', 'upper'],
  ])('%s → %s', (input, expected) => {
    expect(toTableName(input)).toBe(expected)
  })

  it('de-duplicates against taken names, case-insensitively', () => {
    expect(toTableName('sales.csv', ['sales'])).toBe('sales_2')
    expect(toTableName('sales.csv', ['SALES', 'sales_2'])).toBe('sales_3')
  })

  it('caps the length at 63 characters', () => {
    const name = toTableName(`${'a'.repeat(80)}.csv`)
    expect(name).toHaveLength(63)
    expect(isValidTableName(name)).toBe(true)
  })
})

describe('isValidTableName', () => {
  it.each(['sales', '_x', 't_2025', 'a1_b2'])('accepts %s', (name) => {
    expect(isValidTableName(name)).toBe(true)
  })

  it.each(['', '2025', 'Sales', 'my table', 'x-y', 'a'.repeat(64)])('rejects %s', (name) => {
    expect(isValidTableName(name)).toBe(false)
  })
})

describe('quoting', () => {
  it('escapes embedded quotes', () => {
    expect(quoteIdent('my "col"')).toBe('"my ""col"""')
    expect(quoteLiteral("it's")).toBe("'it''s'")
  })
})
