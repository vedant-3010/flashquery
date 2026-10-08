import { describe, expect, it } from 'vitest'
import { selectChart } from '@/charts/select'
import type { CellValue, ColumnMeta } from '@/engine/types'
import { summarizeChart } from './chartSummary'

// F-ASK-11 for the v2 chart types: the local headline (Strict and demo mode), no LLM.

const col = (name: string, logicalType: ColumnMeta['logicalType']): ColumnMeta => ({
  name,
  duckType: logicalType === 'text' ? 'VARCHAR' : logicalType === 'date' ? 'DATE' : 'DOUBLE',
  logicalType,
})

function summary(columns: ColumnMeta[], rows: CellValue[][], question = '') {
  const spec = selectChart({ columns, rows, rowCount: rows.length, question })
  const result = summarizeChart(
    spec,
    { columns, rows, rowCount: rows.length, sampling: 'none' },
    'en-US',
  )
  return { type: spec.type, ...result }
}

describe('local summaries of the v2 charts (F-ASK-11)', () => {
  it('a KPI over time: the latest value and how it moved', () => {
    const s = summary(
      [col('month', 'date'), col('revenue', 'number')],
      [
        ['2025-01-01', 100],
        ['2025-02-01', 120],
        ['2025-03-01', 150],
      ],
      'What is revenue this month?',
    )
    expect(s.type).toBe('kpi')
    expect(s.headline).toBe('Revenue: 150 in Mar 2025, up 25% from Feb 2025.')
  })

  it('a waterfall: the total and the biggest rise and fall', () => {
    const s = summary(
      [col('driver', 'text'), col('profit_change', 'number')],
      [
        ['Price', 120],
        ['Volume', 80],
        ['Costs', -260],
      ],
      'What drove the change in profit?',
    )
    expect(s.type).toBe('waterfall')
    expect(s.headline).toBe('The 3 drivers add up to -60 profit change.')
    expect(s.bullets).toEqual(['Biggest rise: Price (+120).', 'Biggest fall: Costs (-260).'])
  })

  it('a funnel: what is left of the first stage, and the biggest drop', () => {
    const s = summary(
      [col('stage', 'text'), col('users', 'integer')],
      [
        ['Visited', 1000],
        ['Signed up', 400],
        ['Paid', 80],
      ],
    )
    expect(s.type).toBe('funnel')
    expect(s.headline).toBe('Paid keeps 8% of Visited (80 of 1,000).')
    expect(s.bullets).toEqual(['Biggest drop: Signed up → Paid (80% lost).'])
  })

  it('a sankey: the biggest flow', () => {
    const s = summary(
      [col('source', 'text'), col('target', 'text'), col('customers', 'integer')],
      [
        ['Basic', 'Basic', 50],
        ['Basic', 'Pro', 20],
        ['Pro', 'Pro', 30],
      ],
    )
    expect(s.type).toBe('sankey')
    expect(s.headline).toBe('The biggest flow is Basic → Basic (50).')
    expect(s.bullets).toEqual(['3 flows from 2 sources to 2 targets.'])
  })

  it('bars and a line: the top bar, and the line’s high point', () => {
    const s = summary(
      [col('category', 'text'), col('total_revenue', 'number'), col('profit_margin', 'number')],
      [
        ['A', 1e8, 0.31],
        ['B', 2e8, 0.25],
        ['C', 3e8, 0.4],
      ],
    )
    expect(s.type).toBe('combo')
    expect(s.headline).toBe('C has the highest total revenue (300M).')
    expect(s.bullets).toEqual(['Highest profit margin: C (40%).'])
  })
})
