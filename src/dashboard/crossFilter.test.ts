import { describe, expect, it } from 'vitest'
import type { DashboardTile } from '@/dashboard/schema'
import type { DashboardFilter } from '@/engine/filters'
import type { DatasetProfile } from '@/engine/types'
import { crossFilterTarget, toggleCrossFilter } from './crossFilter'

const sales = {
  table: 'global_sales',
  columns: [{ name: 'region' }, { name: 'revenue' }],
} as unknown as DatasetProfile
const tile = (x: string | null, type = 'bar') =>
  ({
    type: 'chart',
    chartSpec: { type, x },
    datasetRefs: [{ table: 'global_sales' }],
  }) as unknown as DashboardTile

describe('cross-filtering (F-DASH-11)', () => {
  it('targets the category column when the table has it', () => {
    expect(crossFilterTarget(tile('region'), [sales])).toEqual({
      table: 'global_sales',
      column: 'region',
    })
    expect(crossFilterTarget(tile('month'), [sales])).toBeNull()
    expect(crossFilterTarget(tile('region', 'line'), [sales])).toBeNull()
    expect(crossFilterTarget(tile('region'), [])).toBeNull()
  })

  it('sets a value filter, replaces it, and clears it on a second click', () => {
    const target = { table: 'global_sales', column: 'region' }
    const first = toggleCrossFilter([], target, 'APAC')
    expect(first).toEqual({
      ok: true,
      cleared: false,
      filters: [{ kind: 'values', table: 'global_sales', column: 'region', values: ['APAC'] }],
    })
    const filters = first.ok ? first.filters : []
    const second = toggleCrossFilter(filters, target, 'MEA')
    expect(second.ok && second.filters).toEqual([
      { kind: 'values', table: 'global_sales', column: 'region', values: ['MEA'] },
    ])
    expect(toggleCrossFilter(filters, target, 'APAC')).toEqual({
      ok: true,
      filters: [],
      cleared: true,
    })
  })

  it('refuses "Other" and a fourth value filter', () => {
    const target = { table: 't', column: 'c' }
    expect(toggleCrossFilter([], target, 'Other').ok).toBe(false)
    const three: DashboardFilter[] = ['a', 'b', 'd'].map((column) => ({
      kind: 'values',
      table: 't',
      column,
      values: ['x'],
    }))
    expect(toggleCrossFilter(three, target, 'x')).toMatchObject({ ok: false })
  })
})
