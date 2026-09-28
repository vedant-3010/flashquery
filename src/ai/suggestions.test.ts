import { describe, expect, it } from 'vitest'
import type { ColumnProfile, DatasetProfile } from '@/engine/types'
import { suggestQuestions } from './suggestions'

const column = (
  name: string,
  type: string,
  role: ColumnProfile['role'],
  distinct = 5,
): ColumnProfile => ({
  name,
  type,
  role,
  nullPct: 0,
  approxDistinct: distinct,
  min: null,
  max: null,
  mean: null,
  quartiles: null,
  topValues: [],
  description: null,
  unit: null,
})

const dataset = (columns: ColumnProfile[]): DatasetProfile => ({
  id: 'd',
  table: 't',
  label: 't',
  source: {
    kind: 'sample',
    format: 'generated',
    fileName: null,
    sizeBytes: null,
    sheet: null,
    csv: null,
    skippedRows: 0,
  },
  rowCount: 100,
  schemaHash: 'x',
  columns,
  notes: null,
  timings: { loadMs: 0, profileMs: 0 },
  createdAt: 0,
})

describe('suggestQuestions (F-PROF-03)', () => {
  it('builds questions from measures, categories and time', () => {
    const questions = suggestQuestions([
      dataset([
        column('order_id', 'BIGINT', 'id', 100),
        column('order_date', 'DATE', 'time'),
        column('region', 'VARCHAR', 'geo'),
        column('product', 'VARCHAR', 'category'),
        column('units', 'INTEGER', 'measure'),
        column('revenue', 'DOUBLE', 'measure'),
      ]),
    ])
    expect(questions).toEqual([
      'Total revenue by region',
      'Revenue by month',
      'Top 10 products by revenue',
      'How many rows per month?',
    ])
  })

  it('prefers additive measures and averages the rest', () => {
    const [first] = suggestQuestions([
      dataset([
        column('region', 'VARCHAR', 'geo'),
        column('unit_price', 'DOUBLE', 'measure'),
        column('discount', 'DOUBLE', 'measure'),
        column('revenue', 'DOUBLE', 'measure'),
      ]),
    ])
    expect(first).toBe('Total revenue by region')
    expect(
      suggestQuestions([
        dataset([column('region', 'VARCHAR', 'geo'), column('unit_price', 'DOUBLE', 'measure')]),
      ])[0],
    ).toBe('Average unit price by region')
  })

  it('falls back to counts when there is no measure, and caps at 5', () => {
    expect(suggestQuestions([dataset([column('status', 'VARCHAR', 'category')])])).toEqual([
      'How many rows are there for each status?',
    ])
    const many = Array.from({ length: 4 }, () =>
      dataset([
        column('city', 'VARCHAR', 'geo'),
        column('sales', 'DOUBLE', 'measure'),
        column('day', 'DATE', 'time'),
      ]),
    )
    expect(suggestQuestions(many).length).toBeLessThanOrEqual(5)
  })
})
