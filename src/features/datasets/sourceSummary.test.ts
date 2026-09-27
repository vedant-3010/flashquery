import { describe, expect, it } from 'vitest'
import type { DatasetProfile, DatasetSource } from '@/engine/types'
import { sourceSummary } from './sourceSummary'

const dataset = (source: Partial<DatasetSource>): DatasetProfile => ({
  id: 'd1',
  table: 't',
  label: 't',
  source: {
    kind: 'file',
    format: 'csv',
    fileName: 'sales.csv',
    sizeBytes: 12_300_000,
    sheet: null,
    csv: { delimiter: ';', hasHeader: true },
    skippedRows: 0,
    ...source,
  },
  rowCount: 10,
  schemaHash: '00000000',
  columns: [],
  notes: null,
  timings: { loadMs: 1_500, profileMs: 600 },
  createdAt: 0,
})

describe('sourceSummary', () => {
  it('describes a CSV file and its dialect', () => {
    expect(sourceSummary(dataset({}), 'en-US')).toBe(
      'sales.csv · 12.3 MB · semicolon-separated · header row · loaded in 2.1 s',
    )
  })

  it('mentions skipped rows and tab delimiters', () => {
    expect(
      sourceSummary(
        dataset({ skippedRows: 3, csv: { delimiter: '\t', hasHeader: false } }),
        'en-US',
      ),
    ).toBe(
      'sales.csv · 12.3 MB · tab-separated · no header row · 3 bad rows skipped · loaded in 2.1 s',
    )
  })

  it('describes Excel sheets and generated samples', () => {
    expect(
      sourceSummary(
        dataset({ format: 'excel', fileName: 'q.xlsx', sheet: 'Q1', sizeBytes: 5_000, csv: null }),
        'en-US',
      ),
    ).toBe('q.xlsx · sheet “Q1” · 5 KB · loaded in 2.1 s')
    expect(
      sourceSummary(
        dataset({
          kind: 'sample',
          format: 'generated',
          fileName: null,
          sizeBytes: null,
          csv: null,
        }),
        'en-US',
      ),
    ).toBe('Generated in your browser · loaded in 2.1 s')
  })
})
