import { describe, expect, it } from 'vitest'
import type { ColumnMeta } from '@/engine/types'
import { summarizeLocally } from './summary'

const col = (name: string, logicalType: ColumnMeta['logicalType']): ColumnMeta => ({
  name,
  duckType: logicalType === 'text' ? 'VARCHAR' : logicalType === 'integer' ? 'BIGINT' : 'DOUBLE',
  logicalType,
})

describe('summarizeLocally (F-ASK-11)', () => {
  it('ranks categories by the last measure, with signed growth', () => {
    const summary = summarizeLocally({
      columns: [
        col('region', 'text'),
        col('revenue_2022', 'number'),
        col('revenue_2025', 'number'),
        col('growth_pct', 'number'),
      ],
      rows: [
        ['APAC', 1e6, 2.46e6, 1.46],
        ['LATAM', 5e5, 8.2e5, 0.64],
        ['North America', 2e6, 2.2e6, 0.12],
      ],
      rowCount: 3,
      locale: 'en-US',
    })
    expect(summary.headline).toBe('APAC leads with +146%, followed by LATAM (+64%).')
    expect(summary.bullets).toEqual(['3 rows compared.', 'Lowest: North America (+12%).'])
    expect(summary.caveats).toEqual([])
  })

  it('reports a single value (KPI)', () => {
    const summary = summarizeLocally({
      columns: [col('total_revenue', 'number')],
      rows: [[12_345_678.9]],
      rowCount: 1,
      locale: 'en-US',
    })
    expect(summary.headline).toBe('Total revenue: 12.3M.')
  })

  it('describes a time series from first to last', () => {
    const summary = summarizeLocally({
      columns: [col('year', 'integer'), col('total_revenue', 'number')],
      rows: [
        [2022, 1_000_000],
        [2023, 1_500_000],
        [2025, 2_000_000],
      ],
      rowCount: 3,
      locale: 'en-US',
    })
    expect(summary.headline).toBe('Total revenue went from 1M in 2022 to 2M in 2025 (+100%).')
    expect(summary.bullets).toEqual(['Highest: 2M in 2025.', 'Lowest: 1M in 2022.'])
  })

  it('says highest/lowest when the result is not ranked', () => {
    const summary = summarizeLocally({
      columns: [col('category', 'text'), col('return_rate', 'number')],
      rows: [
        ['Beauty', 0.025],
        ['Apparel', 0.09],
        ['Home', 0.024],
      ],
      rowCount: 3,
      locale: 'en-US',
    })
    expect(summary.headline).toBe(
      'Apparel has the highest return rate (9%); Home the lowest (2.4%).',
    )
  })

  it('handles empty, measure-less and truncated results', () => {
    expect(
      summarizeLocally({ columns: [col('a', 'text')], rows: [], rowCount: 0, locale: 'en-US' })
        .headline,
    ).toBe('No rows matched this question.')
    expect(
      summarizeLocally({
        columns: [col('name', 'text')],
        rows: [['x'], ['y']],
        rowCount: 2,
        locale: 'en-US',
      }).headline,
    ).toBe('2 rows returned.')
    const truncated = summarizeLocally({
      columns: [col('product', 'text'), col('units', 'integer')],
      rows: [
        ['A', 30],
        ['B', 20],
      ],
      rowCount: 9000,
      locale: 'en-US',
    })
    expect(truncated.caveats).toEqual(['Summary based on the first 2 of 9,000 rows.'])
  })

  it('treats ids and years as labels, not measures', () => {
    const summary = summarizeLocally({
      columns: [col('order_id', 'integer'), col('revenue', 'number')],
      rows: [
        [7, 50],
        [3, 20],
      ],
      rowCount: 2,
      locale: 'en-US',
    })
    expect(summary.headline).toBe('7 leads with 50, followed by 3 (20).')
  })
})
