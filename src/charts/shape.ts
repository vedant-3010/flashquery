import { MAX_SERIES } from '@/charts/build/common'
import {
  index,
  label,
  MAX_CATEGORIES,
  num,
  OTHER,
  sortCategories,
  timeValue,
  topN,
  type ChartData,
  type NamedValues,
  type Prepared,
} from '@/charts/prepared'
import { boxplot, calendar, combo, funnel, sankey, treemap, waterfall } from '@/charts/shapeMore'
import type { ChartSpec } from '@/charts/spec'
import type { CellValue } from '@/engine/types'
import { formatNumber, humanizeName, pluralize } from '@/lib/format'

// Chart data (≤ 5,000 points, from engine/chartData.ts) shaped for one chart: series pivoted,
// categories sorted, top-N + "Other" for long tails (F-VIZ-04). Pure; toOption.ts draws the result.
// The v2 types are shaped in shapeMore.ts.

export {
  label,
  MAX_CATEGORIES,
  OTHER,
  timeValue,
  type ChartData,
  type NamedValues,
  type Prepared,
} from '@/charts/prepared'

function kpi(spec: ChartSpec, data: ChartData): Prepared {
  if (spec.x) return kpiTrend(spec, data)
  const [row] = data.rows
  const items = spec.y.map((name) => ({
    label: humanizeName(name),
    value: num(row?.[index(data, name)]),
  }))
  const measureNames = new Set(spec.y)
  const caption = data.columns
    .map((column, i) => ({ column, value: row?.[i] }))
    .filter(
      ({ column, value }) =>
        !measureNames.has(column.name) && value !== null && value !== undefined,
    )
    .map(({ value }) => label(value))
    .join(' · ')
  return { kind: 'kpi', items, caption: caption || null }
}

/** A KPI over time (F-VIZ-10): the latest value of each measure, the one before, and the trend. */
function kpiTrend(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const xColumn = data.columns[xi]
  const when = (row: CellValue[]) => timeValue(row[xi], xColumn) ?? label(row[xi])
  const rows = [...data.rows].sort((a, b) => {
    const [p, q] = [when(a), when(b)]
    return typeof p === 'number' && typeof q === 'number'
      ? p - q
      : String(p).localeCompare(String(q))
  })
  const last = rows.at(-1)
  const before = rows.at(-2)
  const items = spec.y.map((name) => {
    const yi = index(data, name)
    return {
      label: humanizeName(name),
      value: num(last?.[yi]),
      previous: before ? num(before[yi]) : null,
      trend: rows.map((row) => num(row[yi])),
    }
  })
  const first = rows[0] ? when(rows[0]) : 0
  const latest = last ? when(last) : 0
  return {
    kind: 'kpi',
    items,
    caption: null,
    period: {
      latest,
      previous: before ? when(before) : null,
      spanMs: typeof first === 'number' && typeof latest === 'number' ? latest - first : 0,
    },
  }
}

/** Bars: one series per measure, or per value of `series`; long tails → top N + Other. */
function categorical(spec: ChartSpec, data: ChartData, additive: boolean): Prepared {
  const xi = index(data, spec.x)
  const si = index(data, spec.series)
  const notes: string[] = []
  const order: string[] = []
  const cells = new Map<string, Map<string, number | null>>()
  const seriesOrder: string[] = []
  for (const row of data.rows) {
    const x = label(row[xi])
    if (!cells.has(x)) {
      cells.set(x, new Map())
      order.push(x)
    }
    if (si >= 0) {
      const s = label(row[si])
      if (!seriesOrder.includes(s)) seriesOrder.push(s)
      cells.get(x)?.set(s, num(row[index(data, spec.y[0] ?? null)]))
    } else {
      for (const y of spec.y) cells.get(x)?.set(y, num(row[index(data, y)]))
    }
  }
  // Dates along x stay in time order and keep their moment, for date labels.
  const xColumn = data.columns[xi]
  const moments = new Map(order.map((x) => [x, timeValue(x, xColumn)]))
  const timed = order.length > 0 && [...moments.values()].every((t) => t !== null)
  if (timed) order.sort((a, b) => (moments.get(a) ?? 0) - (moments.get(b) ?? 0))
  const seriesNames = si >= 0 ? seriesOrder : spec.y
  const value = (x: string, s: string) => cells.get(x)?.get(s) ?? null
  const rowTotal = (x: string) => seriesNames.reduce((sum, s) => sum + (value(x, s) ?? 0), 0)
  const seriesTotal = (s: string) => order.reduce((sum, x) => sum + (value(x, s) ?? 0), 0)

  // Series beyond MAX_SERIES (by total) → Other.
  let keptSeries = seriesNames
  let otherSeries = new Set<string>()
  if (si >= 0) {
    const top = topN(seriesNames, seriesTotal, MAX_SERIES - 1)
    keptSeries = top.kept
    otherSeries = top.rest
    if (otherSeries.size > 0) {
      const noun = pluralize(humanizeName(spec.series ?? '').toLowerCase())
      notes.push(
        additive
          ? `The ${formatNumber(otherSeries.size, 'en-US')} smallest ${noun} are combined as Other.`
          : `Showing the top ${keptSeries.length} ${noun} of ${seriesNames.length}.`,
      )
    }
  }

  // Grouped/stacked bars: categories beyond MAX_CATEGORIES → Other.
  let categories = sortCategories(order, new Map(order.map((x) => [x, rowTotal(x)])), spec.sort)
  let otherCategories = new Set<string>()
  const multi = seriesNames.length > 1
  if (multi && categories.length > MAX_CATEGORIES + 1) {
    const top = topN(categories, rowTotal, MAX_CATEGORIES)
    otherCategories = top.rest
    categories = categories.filter((x) => !otherCategories.has(x))
    const noun = pluralize(humanizeName(spec.x ?? '').toLowerCase())
    notes.push(
      additive
        ? `The ${formatNumber(otherCategories.size, 'en-US')} smallest ${noun} are combined as Other.`
        : `Showing the top ${categories.length} ${noun} of ${order.length}.`,
    )
    if (additive) categories.push(OTHER)
  }

  const cell = (x: string, s: string): number | null => {
    const xs = x === OTHER && otherCategories.size > 0 ? [...otherCategories] : [x]
    let total: number | null = null
    for (const one of xs) {
      const v = value(one, s)
      if (v !== null) total = (total ?? 0) + v
    }
    return total
  }
  const series: NamedValues[] = keptSeries.map((s) => ({
    name: si >= 0 ? s : humanizeName(s),
    values: categories.map((x) => cell(x, s)),
    other: false,
  }))
  if (otherSeries.size > 0 && additive) {
    series.push({
      name: OTHER,
      values: categories.map((x) => {
        let total: number | null = null
        for (const s of otherSeries) {
          const v = cell(x, s)
          if (v !== null) total = (total ?? 0) + v
        }
        return total
      }),
      other: true,
    })
  }
  return {
    kind: 'category',
    categories,
    series,
    notes,
    ...(timed ? { times: categories.map((x) => moments.get(x) ?? 0) } : {}),
  }
}

function timeSeries(spec: ChartSpec, data: ChartData, additive: boolean): Prepared {
  const xi = index(data, spec.x)
  const si = index(data, spec.series)
  const xColumn = data.columns[xi]
  const notes: string[] = []
  const continuous = data.rows.every(
    (row) => row[xi] === null || timeValue(row[xi], xColumn) !== null,
  )
  const xOf = (row: CellValue[]): number | string =>
    continuous ? (timeValue(row[xi], xColumn) ?? 0) : label(row[xi])

  let rows = data.rows
  if (continuous) rows = [...rows].sort((a, b) => (xOf(a) as number) - (xOf(b) as number))
  else if (spec.sort === 'asc' && xColumn?.logicalType === 'integer') {
    rows = [...rows].sort((a, b) => (num(a[xi]) ?? 0) - (num(b[xi]) ?? 0))
  }
  const categories: string[] = []
  if (!continuous) {
    for (const row of rows) {
      const x = label(row[xi])
      if (!categories.includes(x)) categories.push(x)
    }
  }

  type Line = { name: string; points: [number | string, number | null][]; other: boolean }
  let series: Line[]
  if (si >= 0) {
    const groups = new Map<string, [number | string, number | null][]>()
    const yi = index(data, spec.y[0] ?? null)
    for (const row of rows) {
      const s = label(row[si])
      if (!groups.has(s)) groups.set(s, [])
      groups.get(s)?.push([xOf(row), num(row[yi])])
    }
    const total = (s: string) =>
      (groups.get(s) ?? []).reduce((sum, [, y]) => sum + Math.abs(y ?? 0), 0)
    const { kept, rest } = topN([...groups.keys()], total, MAX_SERIES - 1)
    series = kept.map((name) => ({ name, points: groups.get(name) ?? [], other: false }))
    if (rest.size > 0) {
      const noun = pluralize(humanizeName(spec.series ?? '').toLowerCase())
      if (additive) {
        const sums = new Map<number | string, number>()
        for (const name of rest) {
          for (const [x, y] of groups.get(name) ?? []) sums.set(x, (sums.get(x) ?? 0) + (y ?? 0))
        }
        const points = [...sums.entries()].sort((a, b) =>
          continuous ? (a[0] as number) - (b[0] as number) : 0,
        )
        series.push({ name: OTHER, points, other: true })
        notes.push(`The ${rest.size} smallest ${noun} are combined as Other.`)
      } else {
        notes.push(`Showing the top ${kept.length} ${noun} of ${groups.size}.`)
      }
    }
  } else {
    series = spec.y.map((name) => {
      const yi = index(data, name)
      return {
        name: humanizeName(name),
        points: rows.map((row): [number | string, number | null] => [xOf(row), num(row[yi])]),
        other: false,
      }
    })
  }
  const times = continuous ? rows.map((row) => xOf(row) as number) : []
  const spanMs = times.length > 1 ? (times.at(-1) ?? 0) - (times[0] ?? 0) : 0
  if (data.sampling === 'step') {
    notes.push(
      `Every n-th of ${formatNumber(data.rowCount, 'en-US')} points is drawn, to keep the chart fast.`,
    )
  }
  return {
    kind: 'time',
    axis: continuous ? 'time' : 'category',
    categories,
    series,
    spanMs,
    notes,
  }
}

function pie(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const yi = index(data, spec.y[0] ?? null)
  const slices = data.rows
    .map((row) => ({ name: label(row[xi]), value: num(row[yi]) ?? 0 }))
    .sort((a, b) => b.value - a.value)
  return { kind: 'pie', slices, notes: [] }
}

function scatter(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const yi = index(data, spec.y[0] ?? null)
  const zi = index(data, spec.size)
  const si = index(data, spec.series)
  const groups = new Map<string, [number, number, number | null][]>()
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const row of data.rows) {
    const x = num(row[xi])
    const y = num(row[yi])
    if (x === null || y === null) continue
    const size = zi >= 0 ? num(row[zi]) : null
    if (size !== null) {
      min = Math.min(min, size)
      max = Math.max(max, size)
    }
    const name = si >= 0 ? label(row[si]) : humanizeName(spec.y[0] ?? '')
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)?.push([x, y, size])
  }
  const notes =
    data.sampling === 'sample'
      ? [
          `A random sample of ${formatNumber(data.rows.length, 'en-US')} of ${formatNumber(data.rowCount, 'en-US')} rows is shown.`,
        ]
      : []
  return {
    kind: 'scatter',
    series: [...groups.entries()].map(([name, points]) => ({ name, points })),
    sizeRange: zi >= 0 && min <= max ? [min, max] : null,
    notes,
  }
}

function bins(data: ChartData): Prepared {
  return {
    kind: 'bins',
    bins: data.rows.map((row) => ({
      start: num(row[0]) ?? 0,
      end: num(row[1]) ?? 0,
      count: num(row[2]) ?? 0,
    })),
    notes: [],
  }
}

function heatmap(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const si = index(data, spec.series)
  const yi = index(data, spec.y[0] ?? null)
  const xs: string[] = []
  const ys: string[] = []
  for (const row of data.rows) {
    const x = label(row[xi])
    const y = label(row[si])
    if (!xs.includes(x)) xs.push(x)
    if (!ys.includes(y)) ys.push(y)
  }
  const cells: [number, number, number | null][] = data.rows.map((row) => [
    xs.indexOf(label(row[xi])),
    ys.indexOf(label(row[si])),
    num(row[yi]),
  ])
  const values = cells.map(([, , v]) => v).filter((v): v is number => v !== null)
  return {
    kind: 'heatmap',
    xs,
    ys,
    cells,
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
    notes: [],
  }
}

/**
 * Shapes chart data for one spec. `additive` says whether the measure can be summed into "Other"
 * (from classify.isAdditive); otherwise the tail is dropped and a note says so.
 */
export function prepare(spec: ChartSpec, data: ChartData, additive = true): Prepared {
  switch (spec.type) {
    case 'kpi':
      return kpi(spec, data)
    case 'bar':
    case 'hbar':
    case 'grouped_bar':
    case 'stacked_bar':
      return categorical(spec, data, additive)
    case 'line':
    case 'area':
      return timeSeries(spec, data, additive)
    case 'donut':
      return pie(spec, data)
    case 'scatter':
      return scatter(spec, data)
    case 'histogram':
      return bins(data)
    case 'heatmap':
      return heatmap(spec, data)
    case 'table':
      return { kind: 'table' }
    case 'stacked_100':
      return categorical(spec, data, additive)
    case 'combo':
      return combo(spec, data)
    case 'waterfall':
      return waterfall(spec, data)
    case 'funnel':
      return funnel(spec, data)
    case 'treemap':
      return treemap(spec, data)
    case 'boxplot':
      return boxplot(spec, data)
    case 'sankey':
      return sankey(spec, data)
    case 'calendar':
      return calendar(spec, data)
  }
}
