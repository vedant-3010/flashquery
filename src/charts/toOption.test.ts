import { describe, expect, it } from 'vitest'
import type { CellValue, ColumnMeta, LogicalType } from '@/engine/types'
import { selectChart } from './select'
import { prepare, type ChartData } from './shape'
import type { ChartSpec } from './spec'
import { LIGHT_THEME, DARK_THEME } from './theme'
import { describeChart, escapeHtml, toOption } from './toOption'

// F-VIZ-02/04: shaping (top-N + Other, pivots, time axes) and the ECharts options, snapshot-tested.

const DUCK: Record<LogicalType, string> = {
  integer: 'BIGINT',
  number: 'DOUBLE',
  text: 'VARCHAR',
  date: 'DATE',
  timestamp: 'TIMESTAMP',
  boolean: 'BOOLEAN',
  other: 'VARCHAR',
}
const col = (name: string, logicalType: LogicalType): ColumnMeta => ({
  name,
  duckType: DUCK[logicalType],
  logicalType,
})
const data = (columns: ColumnMeta[], rows: CellValue[][]): ChartData => ({
  columns,
  rows,
  rowCount: rows.length,
  sampling: 'none',
})
const ctx = { theme: LIGHT_THEME, locale: 'en-US', animation: false }

function chart(columns: ColumnMeta[], rows: CellValue[][], extra: { question?: string } = {}) {
  const spec = selectChart({ columns, rows, rowCount: rows.length, ...extra })
  const d = data(columns, rows)
  const prepared = prepare(spec, d)
  return { spec, prepared, option: toOption(spec, prepared, ctx) }
}

const regions = chart(
  [col('region', 'text'), col('total_revenue', 'number')],
  [
    ['EMEA', 80_000_000],
    ['APAC', 137_900_000],
    ['LATAM', 56_000_000],
  ],
)

describe('prepare', () => {
  it('sorts bars highest first', () => {
    expect(regions.prepared).toMatchObject({
      kind: 'category',
      categories: ['APAC', 'EMEA', 'LATAM'],
      series: [{ name: 'Total revenue', values: [137_900_000, 80_000_000, 56_000_000] }],
    })
  })

  it('keeps the top 7 series and combines the rest as Other', () => {
    const channels = Array.from({ length: 10 }, (_, i) => `C${i}`)
    const rows = ['2025-01-01', '2025-02-01'].flatMap((m) =>
      channels.map((c, i): CellValue[] => [m, c, 100 - i]),
    )
    const { prepared } = chart(
      [col('month', 'date'), col('channel', 'text'), col('revenue', 'number')],
      rows,
    )
    expect(prepared.kind).toBe('time')
    if (prepared.kind !== 'time') return
    expect(prepared.axis).toBe('time')
    expect(prepared.series.map((s) => s.name)).toEqual([
      'C0',
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
      'C6',
      'Other',
    ])
    expect(prepared.series.at(-1)?.points).toEqual([
      [Date.UTC(2025, 0, 1), 93 + 92 + 91],
      [Date.UTC(2025, 1, 1), 93 + 92 + 91],
    ])
    expect(prepared.notes[0]).toMatch(/3 smallest channels are combined as Other/)
  })

  it('drops the tail instead of summing averages into Other', () => {
    const spec: ChartSpec = {
      ...regions.spec,
      type: 'grouped_bar',
      x: 'region',
      series: 'channel',
      y: ['avg_price'],
      sort: 'desc',
    }
    const rows = Array.from({ length: 10 }, (_, i): CellValue[] => ['A', `C${i}`, i + 1])
    const prepared = prepare(
      spec,
      data([col('region', 'text'), col('channel', 'text'), col('avg_price', 'number')], rows),
      false,
    )
    expect(prepared.kind === 'category' && prepared.series.length).toBe(7)
    expect(prepared.kind === 'category' && prepared.notes[0]).toMatch(
      /Showing the top 7 channels of 10/,
    )
  })

  it('reads years as ordered labels and dates as a time axis', () => {
    const years = chart(
      [col('year', 'integer'), col('revenue', 'number')],
      [
        [2024, 2],
        [2022, 1],
        [2025, 3],
      ],
    )
    expect(years.prepared).toMatchObject({
      kind: 'time',
      axis: 'category',
      categories: ['2022', '2024', '2025'],
    })
  })

  it('pivots two categories for a heatmap', () => {
    const xs = Array.from({ length: 8 }, (_, i) => `X${i}`)
    const ys = Array.from({ length: 7 }, (_, i) => `Y${i}`)
    const { prepared, spec } = chart(
      [col('store', 'text'), col('product', 'text'), col('orders', 'integer')],
      xs.flatMap((x, i) => ys.map((y, j): CellValue[] => [x, y, i * j])),
    )
    expect(spec.type).toBe('heatmap')
    expect(prepared).toMatchObject({ kind: 'heatmap', min: 0, max: 42 })
  })
})

describe('toOption', () => {
  it('draws bars with formatted axes (snapshot)', () => {
    expect(regions.option).toMatchSnapshot()
  })

  it('draws a donut with percent labels (snapshot)', () => {
    const { option, spec } = chart(
      [col('segment', 'text'), col('revenue', 'number')],
      [
        ['Consumer', 50],
        ['SMB', 30],
        ['Enterprise', 20],
      ],
      { question: 'What share of revenue comes from each segment?' },
    )
    expect(spec.type).toBe('donut')
    expect(option).toMatchSnapshot()
  })

  it('draws a time-axis line in UTC with lttb sampling', () => {
    const { option } = chart(
      [col('month', 'date'), col('revenue', 'number')],
      Array.from({ length: 24 }, (_, i): CellValue[] => [
        `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
        i,
      ]),
    )
    expect(option).toMatchObject({
      useUTC: true,
      xAxis: { type: 'time' },
      series: [{ type: 'line', sampling: 'lttb', showSymbol: true }],
    })
    expect(option).toMatchSnapshot()
  })

  it('uses large mode and sized points for scatter', () => {
    const rows = Array.from({ length: 3000 }, (_, i): CellValue[] => [i, i * 2, i % 10])
    const { option, spec } = chart(
      [col('price', 'number'), col('units', 'number'), col('orders', 'integer')],
      rows,
    )
    expect(spec.type).toBe('scatter')
    expect(option).toMatchObject({ series: [{ type: 'scatter', large: true }] })
  })

  it('switches colors with the theme without touching the data', () => {
    const dark = toOption(regions.spec, regions.prepared, { ...ctx, theme: DARK_THEME })
    expect(dark?.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: [137_900_000, 80_000_000, 56_000_000] }),
      ]),
    )
    expect(dark?.color).toEqual(DARK_THEME.palette)
  })

  it('returns null for KPIs and tables', () => {
    const kpi = chart([col('total', 'number')], [[5]])
    expect(kpi.option).toBeNull()
  })
})

describe('text alternatives', () => {
  it('describes a chart in one sentence', () => {
    expect(describeChart(regions.spec, regions.prepared, 'en-US')).toBe(
      'Bar chart: Total revenue by region. 3 categories. Highest APAC (137,900,000), lowest LATAM (56,000,000).',
    )
  })

  it('escapes data in HTML tooltips', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    )
  })
})
