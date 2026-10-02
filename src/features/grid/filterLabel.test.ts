import { describe, expect, it } from 'vitest'
import { filterLabel } from './filterLabel'

describe('filter chips (F-GRID-04)', () => {
  it('describes each kind of filter', () => {
    expect(filterLabel({ column: 'name', kind: 'contains', text: 'pro' }, 'en-US')).toBe(
      'name contains “pro”',
    )
    expect(filterLabel({ column: 'revenue', kind: 'range', min: 100, max: 2500 }, 'en-US')).toBe(
      'revenue 100–2,500',
    )
    expect(filterLabel({ column: 'revenue', kind: 'range', min: null, max: 5 }, 'en-US')).toBe(
      'revenue ≤ 5',
    )
    expect(
      filterLabel({ column: 'day', kind: 'dates', from: '2024-01-01', to: null }, 'en-US'),
    ).toBe('day from Jan 1, 2024')
    expect(
      filterLabel(
        { column: 'region', kind: 'values', values: ['APAC', null, 'EU', 'LATAM'] },
        'en-US',
      ),
    ).toBe('region is APAC or null or EU +1')
  })
})
