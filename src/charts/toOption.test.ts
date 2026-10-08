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

describe('v2 chart types (F-VIZ-09, F-VIZ-10)', () => {
  const regionsByChannel = ['APAC', 'EMEA', 'LATAM'].flatMap((r, i) =>
    ['Online', 'Retail'].map((c, j): CellValue[] => [r, c, (i + 1) * 10 + j * 5]),
  )

  it('draws a 100% stacked bar as each bar’s shares (snapshot)', () => {
    const { spec, prepared, option } = chart(
      [col('region', 'text'), col('channel', 'text'), col('revenue', 'number')],
      regionsByChannel,
      { question: 'What is the channel mix in each region?' },
    )
    expect(spec.type).toBe('stacked_100')
    const series = (option?.series ?? []) as { data: (number | null)[] }[]
    const firstBar = series.reduce((sum, s) => sum + (s.data[0] ?? 0), 0)
    expect(firstBar).toBeCloseTo(1)
    expect(option).toMatchObject({ yAxis: { min: 0, max: 1 } })
    expect(describeChart(spec, prepared, 'en-US')).toMatch(/^100% stacked bar chart: /)
    expect(option).toMatchSnapshot()
  })

  it('draws bars and a line on two axes (snapshot)', () => {
    const { spec, option } = chart(
      [col('category', 'text'), col('total_revenue', 'number'), col('profit_margin', 'number')],
      [
        ['A', 1e8, 0.31],
        ['B', 2e8, 0.25],
        ['C', 3e8, 0.4],
      ],
    )
    expect(spec.type).toBe('combo')
    expect(option).toMatchObject({
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [{ type: 'bar' }, { type: 'line', yAxisIndex: 1 }],
    })
    expect(option).toMatchSnapshot()
  })

  it('floats waterfall steps from the running total and ends on the total (snapshot)', () => {
    const { spec, prepared, option } = chart(
      [col('driver', 'text'), col('profit_change', 'number')],
      [
        ['Price', 120],
        ['Volume', 80],
        ['Costs', -260],
      ],
      { question: 'What drove the change in profit?' },
    )
    expect(spec.type).toBe('waterfall')
    expect(prepared).toMatchObject({ kind: 'waterfall', total: -60 })
    const [lows, bars] = (option?.series ?? []) as { data: unknown[]; stackStrategy?: string }[]
    // 0 → 120 → 200 → -60, then the total from 0 down to -60.
    expect(lows?.data).toEqual([0, 120, -60, -60])
    const heights = ((bars?.data ?? []) as { value: number }[]).map((bar) => bar.value)
    expect(heights).toEqual([120, 80, 260, 60])
    expect(bars?.stackStrategy).toBe('all')
    expect(describeChart(spec, prepared, 'en-US')).toContain('3 steps adding up to -60')
    expect(option).toMatchSnapshot()
  })

  it('draws a funnel in stage order (snapshot)', () => {
    const { spec, option } = chart(
      [col('stage', 'text'), col('users', 'integer')],
      [
        ['Visited', 1000],
        ['Signed up', 400],
        ['Paid', 80],
      ],
    )
    expect(spec.type).toBe('funnel')
    expect(option).toMatchObject({
      series: [
        {
          type: 'funnel',
          sort: 'none',
          data: [{ name: 'Visited' }, { name: 'Signed up' }, { name: 'Paid' }],
        },
      ],
    })
    expect(option).toMatchSnapshot()
  })

  it('draws a treemap of many parts, capped with Other (snapshot)', () => {
    const rows = Array.from({ length: 240 }, (_, i): CellValue[] => [`City ${i + 1}`, 240 - i])
    const { spec, prepared, option } = chart([col('city', 'text'), col('revenue', 'number')], rows)
    expect(spec.type).toBe('treemap')
    expect(prepared).toMatchObject({ kind: 'treemap' })
    const nodes = prepared.kind === 'treemap' ? prepared.nodes : []
    expect(nodes).toHaveLength(200)
    expect(nodes.at(-1)).toMatchObject({ name: 'Other', other: true })
    expect(option).toMatchSnapshot()
  })

  it('draws box plots from quartiles computed in the database (snapshot)', () => {
    const spec = selectChart({
      columns: [col('region', 'text'), col('revenue', 'number')],
      rows: Array.from({ length: 20 }, (_, i): CellValue[] => [i % 2 ? 'A' : 'B', i]),
      rowCount: 20,
    })
    expect(spec.type).toBe('boxplot')
    const quartiles: ChartData = {
      columns: [
        col('group', 'text'),
        col('low', 'number'),
        col('q1', 'number'),
        col('median', 'number'),
        col('q3', 'number'),
        col('high', 'number'),
        col('n', 'integer'),
        col('groups', 'integer'),
      ],
      rows: [
        ['B', 0, 4, 9, 14, 18, 10, 2],
        ['A', 1, 5, 10, 15, 19, 10, 2],
      ],
      rowCount: 20,
      sampling: 'quantiles',
    }
    const prepared = prepare(spec, quartiles)
    const option = toOption(spec, prepared, ctx)
    expect(option).toMatchObject({
      series: [
        {
          type: 'boxplot',
          data: [
            [0, 4, 9, 14, 18],
            [1, 5, 10, 15, 19],
          ],
        },
      ],
    })
    expect(describeChart(spec, prepared, 'en-US')).toContain('medians from 9 (B) to 10 (A)')
    expect(option).toMatchSnapshot()
  })

  it('keeps sankey sides apart, so a name can flow to itself (snapshot)', () => {
    const { spec, prepared, option } = chart(
      [col('source', 'text'), col('target', 'text'), col('customers', 'integer')],
      [
        ['Basic', 'Basic', 50],
        ['Basic', 'Pro', 20],
        ['Pro', 'Pro', 30],
      ],
    )
    expect(spec.type).toBe('sankey')
    const nodes = prepared.kind === 'sankey' ? prepared.nodes.map((node) => node.id) : []
    expect(nodes).toEqual(['from:Basic', 'to:Basic', 'to:Pro', 'from:Pro'])
    expect(option).toMatchSnapshot()
  })

  it('lays daily values on calendars, at most a year each (snapshot)', () => {
    const days = Array.from({ length: 400 }, (_, i): CellValue[] => [
      new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
      i % 7,
    ])
    const { spec, prepared, option } = chart([col('day', 'date'), col('orders', 'integer')], days, {
      question: 'Which weekdays are busiest?',
    })
    expect(spec.type).toBe('calendar')
    expect(prepared).toMatchObject({
      kind: 'calendar',
      ranges: [
        ['2024-01-01', '2024-12-31'],
        ['2025-01-01', '2025-02-03'],
      ],
    })
    expect(option).toMatchSnapshot()
  })

  it('shows a KPI over time as its latest value, the change and the trend', () => {
    const { spec, prepared } = chart(
      [col('month', 'date'), col('revenue', 'number')],
      [
        ['2025-01-01', 100],
        ['2025-02-01', 120],
        ['2025-03-01', 150],
      ],
      { question: 'What is revenue so far this year?' },
    )
    expect(spec).toMatchObject({ type: 'kpi', x: 'month' })
    expect(prepared).toMatchObject({
      kind: 'kpi',
      items: [{ value: 150, previous: 120, trend: [100, 120, 150] }],
    })
    expect(describeChart(spec, prepared, 'en-US')).toBe(
      'Revenue: 150 (up 25% from the period before)',
    )
  })
})
