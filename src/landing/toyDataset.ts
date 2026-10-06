import type { DatasetProfile } from '@/engine/types'

// The small table the landing page's privacy section shows payloads for. Its payloads in data.ts are
// checked against the app's real context builder (src/ai/context.ts) by data.test.ts.

export const TOY_DATASET: DatasetProfile = {
  id: 'toy',
  table: 'orders',
  label: 'orders.csv',
  source: {
    kind: 'file',
    format: 'csv',
    fileName: 'orders.csv',
    sizeBytes: 102_000_000,
    sheet: null,
    csv: { delimiter: ',', hasHeader: true },
    skippedRows: 0,
  },
  rowCount: 1_000_000,
  schemaHash: 'toy',
  columns: [
    {
      name: 'order_date',
      type: 'DATE',
      role: 'time',
      nullPct: 0,
      approxDistinct: 1461,
      min: '2022-01-01',
      max: '2025-12-31',
      mean: null,
      quartiles: null,
      topValues: [],
      description: null,
      unit: null,
    },
    {
      name: 'region',
      type: 'VARCHAR',
      role: 'geo',
      nullPct: 0,
      approxDistinct: 5,
      min: 'APAC',
      max: 'North America',
      mean: null,
      quartiles: null,
      topValues: [
        { value: 'North America', count: 272_806 },
        { value: 'Europe', count: 238_191 },
        { value: 'APAC', count: 218_337 },
      ],
      description: null,
      unit: null,
    },
    {
      name: 'revenue',
      type: 'DOUBLE',
      role: 'measure',
      nullPct: 0,
      approxDistinct: 213_904,
      min: 4.5,
      max: 29980,
      mean: 1393.81,
      quartiles: [189.0, 642.6, 1797.6],
      topValues: [],
      description: 'Order value after discount',
      unit: 'USD',
    },
  ],
  notes: 'Fiscal year starts in April.',
  timings: { loadMs: 0, profileMs: 0 },
  createdAt: 0,
}

export const TOY_SAMPLE = {
  columns: ['order_date', 'region', 'revenue'],
  rows: [
    ['2022-01-01', 'North America', 1798.0],
    ['2022-01-01', 'APAC', 642.6],
    ['2022-01-02', 'Europe', 87.2],
  ],
}
