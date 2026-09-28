import { describe, expect, it } from 'vitest'
import type { ChartHint } from '@/ai/schemas'
import type { CellValue, ColumnMeta, LogicalType } from '@/engine/types'
import { analyze } from './classify'
import { chartChoices, respec, selectChart, type ChartInput } from './select'
import type { ChartSpec } from './spec'

// F-VIZ-01: the §6 rules, table-driven (AC: ≥ 25 cases), plus AI hints and the switcher.

const DUCK: Record<LogicalType, string> = {
  integer: 'BIGINT',
  number: 'DOUBLE',
  text: 'VARCHAR',
  date: 'DATE',
  timestamp: 'TIMESTAMP',
  boolean: 'BOOLEAN',
  other: 'STRUCT(a INTEGER)',
}

const col = (name: string, logicalType: LogicalType): ColumnMeta => ({
  name,
  duckType: DUCK[logicalType],
  logicalType,
})

const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const months = (n: number) =>
  range(n).map((i) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`)
const labels = (prefix: string, n: number) => range(n).map((i) => `${prefix} ${i + 1}`)

function input(
  columns: ColumnMeta[],
  rows: CellValue[][],
  extra: Partial<ChartInput> = {},
): ChartInput {
  return { columns, rows, rowCount: rows.length, ...extra }
}

const zip = (...cols: CellValue[][]) =>
  range(cols[0]?.length ?? 0).map((i) => cols.map((c) => c[i] ?? null))

interface Case {
  name: string
  input: ChartInput
  expect: Partial<ChartSpec>
}

const cases: Case[] = [
  {
    name: '1. one row, one measure → KPI',
    input: input([col('total_revenue', 'number')], [[123.4]]),
    expect: { type: 'kpi', y: ['total_revenue'] },
  },
  {
    name: '2. one row, three measures → KPI group',
    input: input(
      [col('revenue', 'number'), col('orders', 'integer'), col('aov', 'number')],
      [[10, 2, 5]],
    ),
    expect: { type: 'kpi', y: ['revenue', 'orders', 'aov'] },
  },
  {
    name: '3. one row, eight measures → table',
    input: input(
      range(8).map((i) => col(`m${i}`, 'number')),
      [range(8)],
    ),
    expect: { type: 'table' },
  },
  {
    name: '4. date + measure → line, ascending',
    input: input([col('month', 'date'), col('revenue', 'number')], zip(months(12), range(12))),
    expect: { type: 'line', x: 'month', y: ['revenue'], sort: 'asc', series: null },
  },
  {
    name: '5. date + three measures → multi-measure line',
    input: input(
      [
        col('day', 'date'),
        col('revenue', 'number'),
        col('cost', 'number'),
        col('profit', 'number'),
      ],
      zip(months(6), range(6), range(6), range(6)),
    ),
    expect: { type: 'line', y: ['revenue', 'cost', 'profit'] },
  },
  {
    name: '6. date + one cumulative measure → area',
    input: input(
      [col('month', 'date'), col('cumulative_revenue', 'number')],
      zip(months(12), range(12)),
    ),
    expect: { type: 'area' },
  },
  {
    name: '7. integer years are time → line',
    input: input(
      [col('year', 'integer'), col('total_revenue', 'number')],
      zip([2022, 2023, 2024, 2025], [1, 2, 3, 4]),
    ),
    expect: { type: 'line', x: 'year' },
  },
  {
    name: '8. time + category + measure → one line per category',
    input: input(
      [col('month', 'date'), col('channel', 'text'), col('revenue', 'number')],
      months(4).flatMap((m) => ['Online', 'Retail', 'Partner'].map((c) => [m, c, 1])),
    ),
    expect: { type: 'line', x: 'month', series: 'channel', y: ['revenue'] },
  },
  {
    name: '9. many series still draw as lines (top 7 + Other)',
    input: input(
      [col('month', 'date'), col('country', 'text'), col('revenue', 'number')],
      months(3).flatMap((m) => labels('Country', 12).map((c) => [m, c, 1])),
    ),
    expect: { type: 'line', series: 'country' },
  },
  {
    name: '10. five categories + measure → bar, highest first',
    input: input(
      [col('region', 'text'), col('revenue', 'number')],
      zip(['APAC', 'EMEA', 'LATAM', 'NA', 'MEA'], [5, 4, 3, 2, 1]),
    ),
    expect: { type: 'bar', x: 'region', y: ['revenue'], sort: 'desc' },
  },
  {
    name: '11. fifteen categories → horizontal bar',
    input: input(
      [col('product', 'text'), col('revenue', 'number')],
      zip(labels('P', 15), range(15)),
    ),
    expect: { type: 'hbar' },
  },
  {
    name: '12. long labels → horizontal bar',
    input: input(
      [col('product', 'text'), col('revenue', 'number')],
      zip(
        ['Wireless Noise-Cancelling Headphones', 'Mechanical Keyboard Pro', 'USB-C Hub'],
        [3, 2, 1],
      ),
    ),
    expect: { type: 'hbar' },
  },
  {
    name: '13. more than 30 categories → table',
    input: input(
      [col('city', 'text'), col('revenue', 'number')],
      zip(labels('City', 40), range(40)),
    ),
    expect: { type: 'table' },
  },
  {
    name: '14. month names keep their order',
    input: input(
      [col('month_name', 'text'), col('orders', 'integer')],
      zip(['Jan', 'Feb', 'Mar', 'Apr'], [4, 9, 2, 7]),
    ),
    expect: { type: 'bar', sort: 'none' },
  },
  {
    name: '15. share question, four categories → donut',
    input: input(
      [col('segment', 'text'), col('revenue', 'number')],
      zip(['Consumer', 'SMB', 'Enterprise', 'Public'], [5, 3, 2, 1]),
      { question: 'What share of revenue comes from each segment?' },
    ),
    expect: { type: 'donut', x: 'segment' },
  },
  {
    name: '16. share question, nine categories → bar (donuts stop at 6)',
    input: input(
      [col('segment', 'text'), col('revenue', 'number')],
      zip(labels('S', 9), range(9)),
      { question: 'What share of revenue comes from each segment?' },
    ),
    expect: { type: 'bar' },
  },
  {
    name: '17. a share-named measure → donut without a question',
    input: input(
      [col('segment', 'text'), col('total_revenue', 'number'), col('revenue_share', 'number')],
      zip(['A', 'B', 'C'], [5e6, 3e6, 2e6], [0.5, 0.3, 0.2]),
    ),
    expect: { type: 'donut', y: ['revenue_share'] },
  },
  {
    name: '18. category + comparable measures → grouped bar',
    input: input(
      [
        col('region', 'text'),
        col('revenue', 'number'),
        col('cost', 'number'),
        col('profit', 'number'),
      ],
      zip(['A', 'B', 'C'], [100, 90, 80], [60, 50, 40], [40, 40, 40]),
    ),
    expect: { type: 'grouped_bar', y: ['revenue', 'cost', 'profit'], series: null },
  },
  {
    name: '19. measures on different scales → bars of the one asked about',
    input: input(
      [col('category', 'text'), col('total_revenue', 'number'), col('profit_margin', 'number')],
      zip(['A', 'B', 'C'], [1e8, 2e8, 3e8], [0.31, 0.25, 0.4]),
      { question: 'Which category has the highest profit margin?' },
    ),
    expect: { type: 'bar', y: ['profit_margin'], format: { y: 'percent', currency: null } },
  },
  {
    name: '20. two categories + additive measure → stacked bar',
    input: input(
      [col('region', 'text'), col('channel', 'text'), col('revenue', 'number')],
      ['A', 'B', 'C', 'D'].flatMap((r) => ['Online', 'Retail', 'Partner'].map((c) => [r, c, 1])),
    ),
    expect: { type: 'stacked_bar', x: 'region', series: 'channel', stacked: true },
  },
  {
    name: '21. two categories with many values each → heatmap',
    input: input(
      [col('country', 'text'), col('product', 'text'), col('orders', 'integer')],
      labels('C', 10).flatMap((c) => labels('P', 8).map((p) => [c, p, 1])),
    ),
    expect: { type: 'heatmap', x: 'country', series: 'product' },
  },
  {
    name: '22. two categories + an average → grouped bar (averages do not stack)',
    input: input(
      [col('region', 'text'), col('channel', 'text'), col('avg_price', 'number')],
      ['A', 'B'].flatMap((r) => ['Online', 'Retail'].map((c) => [r, c, 1])),
    ),
    expect: { type: 'grouped_bar', series: 'channel', stacked: false },
  },
  {
    name: '23. two measures → scatter',
    input: input(
      [col('discount', 'number'), col('units', 'number')],
      zip(
        range(50).map((i) => i / 100),
        range(50).map((i) => 50 - i),
      ),
    ),
    expect: { type: 'scatter', x: 'discount', y: ['units'], size: null },
  },
  {
    name: '24. three measures → scatter sized by the third',
    input: input(
      [col('discount', 'number'), col('avg_units', 'number'), col('orders', 'integer')],
      zip(
        range(11).map((i) => i / 20),
        range(11),
        range(11),
      ),
    ),
    expect: { type: 'scatter', size: 'orders' },
  },
  {
    name: '25. one measure over many rows → histogram',
    input: input([col('revenue', 'number')], zip(range(100))),
    expect: { type: 'histogram', x: 'revenue', y: ['revenue'] },
  },
  {
    name: '26. one measure over a few rows → table',
    input: input([col('revenue', 'number')], zip(range(5))),
    expect: { type: 'table' },
  },
  {
    name: '27. long text → table',
    input: input(
      [col('review', 'text'), col('stars', 'integer')],
      zip(['x'.repeat(80), 'y'.repeat(90)], [5, 4]),
    ),
    expect: { type: 'table' },
  },
  {
    name: '28. no rows → table',
    input: input([col('region', 'text'), col('revenue', 'number')], []),
    expect: { type: 'table' },
  },
  {
    name: '29. no numbers → table',
    input: input([col('region', 'text'), col('channel', 'text')], [['A', 'B']]),
    expect: { type: 'table' },
  },
  {
    name: '30. a whole-number key labels the counts → bar in key order',
    input: input(
      [col('rating', 'integer'), col('reviews', 'integer'), col('avg_price', 'number')],
      zip([1, 2, 3, 4, 5], [10, 30, 80, 200, 150], [9, 9, 8, 8, 7]),
    ),
    expect: { x: 'rating', sort: 'none' },
  },
  {
    name: '31. repeated categories + two measures → scatter colored by category',
    input: input(
      [col('region', 'text'), col('price', 'number'), col('units', 'number')],
      range(40).map((i) => [['A', 'B', 'C'][i % 3] ?? 'A', i, 40 - i]),
    ),
    expect: { type: 'scatter', series: 'region' },
  },
  {
    name: '32. repeated categories + one measure → table',
    input: input(
      [col('region', 'text'), col('revenue', 'number')],
      range(20).map((i) => [['A', 'B'][i % 2] ?? 'A', i]),
    ),
    expect: { type: 'table' },
  },
  {
    name: '33. ids label a top-N list → bar',
    input: input(
      [col('order_id', 'integer'), col('revenue', 'number')],
      zip([101, 205, 309], [900, 800, 700]),
    ),
    expect: { type: 'bar', x: 'order_id' },
  },
  {
    name: '34. booleans are categories',
    input: input(
      [col('returned', 'boolean'), col('orders', 'integer')],
      zip([true, false], [120, 880]),
    ),
    expect: { type: 'bar', x: 'returned' },
  },
  {
    name: '35. text dates (YYYY-MM) are time',
    input: input(
      [col('period', 'text'), col('revenue', 'number')],
      zip(['2025-01', '2025-02', '2025-03'], [1, 2, 3]),
    ),
    expect: { type: 'line', x: 'period' },
  },
  {
    name: '36. a long time series still draws as a line (downsampled)',
    input: {
      columns: [col('ts', 'timestamp'), col('value', 'number')],
      rows: zip(
        range(1000).map(
          (i) =>
            `2025-01-01T00:${String(i % 60).padStart(2, '0')}:${String(Math.floor(i / 60)).padStart(2, '0')}`,
        ),
        range(1000),
      ),
      rowCount: 1_000_000,
    },
    expect: { type: 'line' },
  },
  {
    name: '37. a million-row scatter is sampled',
    input: {
      columns: [col('unit_price', 'number'), col('revenue', 'number')],
      rows: zip(range(1000), range(1000)),
      rowCount: 1_000_000,
    },
    expect: { type: 'scatter' },
  },
]

describe('selectChart (§6 rules)', () => {
  it('has at least 25 cases', () => expect(cases.length).toBeGreaterThanOrEqual(25))

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const spec = selectChart(c.input)
    expect(spec).toMatchObject(c.expect)
    expect(spec.reason.length).toBeGreaterThan(10)
  })

  it('explains sampling and Other in the reason', () => {
    expect(selectChart(cases[36]?.input ?? cases[0]!.input).reason).toMatch(
      /random sample of 5,000/,
    )
    expect(selectChart(cases[8]?.input ?? cases[0]!.input).reason).toMatch(/combined as Other/)
  })

  it('formats money in the chosen currency and fractions as percent', () => {
    const spec = selectChart(
      input([col('region', 'text'), col('revenue', 'number')], zip(['A', 'B'], [1, 2]), {
        currency: 'EUR',
      }),
    )
    expect(spec.format).toEqual({ y: 'currency', currency: 'EUR' })
    const growth = selectChart(
      input([col('region', 'text'), col('growth_pct', 'number')], zip(['A', 'B'], [1.4, 0.6])),
    )
    expect(growth.format.y).toBe('percent')
  })
})

describe('AI chart hints', () => {
  const years = input(
    [col('year', 'integer'), col('total_revenue', 'number')],
    zip([2022, 2023, 2024, 2025], [1, 2, 3, 4]),
  )
  const hint = (partial: Partial<ChartHint>): ChartHint => ({
    type: null,
    x: null,
    y: [],
    series: null,
    ...partial,
  })

  it('uses a hint that fits the result', () => {
    const spec = selectChart({
      ...years,
      hint: hint({ type: 'bar', x: 'year', y: ['total_revenue'] }),
    })
    expect(spec).toMatchObject({ type: 'bar', x: 'year', sort: 'none' })
    expect(spec.reason).toMatch(/^The AI suggested a bar chart, and it fits/)
  })

  it('falls back to the rules, saying why, when the hint does not fit', () => {
    const nine = input(
      [col('segment', 'text'), col('revenue', 'number')],
      zip(labels('S', 9), range(9)),
    )
    const spec = selectChart({ ...nine, hint: hint({ type: 'donut', x: 'segment' }) })
    expect(spec.type).toBe('bar')
    expect(spec.reason).toMatch(/AI suggested a donut chart, but a donut works for 2–6 slices/)
  })

  it('picks columns itself when the hint names ones that do not exist', () => {
    const spec = selectChart({ ...years, hint: hint({ type: 'bar', x: 'yr', y: ['rev'] }) })
    expect(spec).toMatchObject({ type: 'bar', x: 'year', y: ['total_revenue'] })
  })

  it('ignores a null hint type', () => {
    expect(selectChart({ ...years, hint: hint({}) }).type).toBe('line')
  })
})

describe('chart switcher (F-VIZ-03)', () => {
  const regions = input(
    [col('region', 'text'), col('revenue', 'number')],
    zip(['APAC', 'EMEA', 'LATAM', 'NA', 'MEA', 'EU', 'CIS', 'ANZ'], range(8)),
  )
  const shape = analyze(regions.columns, regions.rows, regions.rowCount)
  const current = selectChart(regions)

  it('offers compatible types and says why the others do not fit', () => {
    const choices = Object.fromEntries(chartChoices(shape, current).map((c) => [c.type, c]))
    expect(choices.bar?.spec?.type).toBe('bar')
    expect(choices.hbar?.spec?.x).toBe('region')
    expect(choices.table?.spec).not.toBeNull()
    expect(choices.donut?.reason).toMatch(/2–6 slices/)
    expect(choices.line?.reason).toMatch(/time column/)
    expect(choices.kpi?.reason).toMatch(/single row/)
    expect(choices.scatter?.reason).toMatch(/two number columns/)
  })

  it('re-fits the chart to columns picked in the settings popover', () => {
    const three = input(
      [col('region', 'text'), col('revenue', 'number'), col('cost', 'number')],
      zip(['A', 'B', 'C'], [3, 2, 1], [1, 1, 1]),
    )
    const s = analyze(three.columns, three.rows, three.rowCount)
    const bar = {
      ...selectChart(three),
      type: 'bar' as const,
      y: ['revenue'],
      sort: 'asc' as const,
    }
    const result = respec(s, bar, { x: 'region', y: ['cost'] })
    expect(result.ok && result.spec).toMatchObject({ y: ['cost'], sort: 'asc' })
    expect(respec(s, bar, { x: 'cost' }).ok).toBe(true)
  })
})
