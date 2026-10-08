import { MAX_TREEMAP_LEAVES } from '@/charts/build/more'
import {
  index,
  label,
  num,
  OTHER,
  timeValue,
  type ChartData,
  type NamedValues,
  type Prepared,
  type TreeNode,
} from '@/charts/prepared'
import type { ChartSpec } from '@/charts/spec'
import type { CellValue } from '@/engine/types'
import { formatNumber, humanizeName, parseIsoUtc, pluralize } from '@/lib/format'

// Shapes the v2 chart types (F-VIZ-09) for toOption.ts. Pure.

const DAY_MS = 86_400_000
/** Two-level treemaps: at most this many tiles inside each group; the rest become "Other". */
const MAX_LEAVES_PER_GROUP = 40

/** Rows in time order when x holds moments, with each row's moment; else as they came. */
function byTime(data: ChartData, xi: number) {
  const column = data.columns[xi]
  const moments = data.rows.map((row) => timeValue(row[xi], column))
  if (data.rows.length === 0 || moments.some((t) => t === null)) {
    return { rows: data.rows, times: null }
  }
  const order = data.rows.map((row, i) => ({ row, t: moments[i] ?? 0 })).sort((a, b) => a.t - b.t)
  return { rows: order.map((entry) => entry.row), times: order.map((entry) => entry.t) }
}

export function combo(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const bi = index(data, spec.y[0] ?? null)
  const li = index(data, spec.y[1] ?? null)
  const timed = byTime(data, xi)
  let rows = timed.rows
  if (!timed.times && spec.sort !== 'none') {
    const sign = spec.sort === 'desc' ? -1 : 1
    rows = [...rows].sort(
      (a, b) =>
        sign *
        ((num(a[bi]) ?? Number.NEGATIVE_INFINITY) - (num(b[bi]) ?? Number.NEGATIVE_INFINITY)),
    )
  }
  const series = (i: number, name: string | undefined): NamedValues => ({
    name: humanizeName(name ?? ''),
    values: rows.map((row) => num(row[i])),
    other: false,
  })
  return {
    kind: 'combo',
    categories: rows.map((row) => label(row[xi])),
    times: timed.times,
    bars: series(bi, spec.y[0]),
    line: series(li, spec.y[1]),
    notes: [],
  }
}

export function waterfall(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const yi = index(data, spec.y[0] ?? null)
  const { rows, times } = byTime(data, xi)
  const steps = rows.map((row) => ({ name: label(row[xi]), value: num(row[yi]) ?? 0 }))
  return {
    kind: 'waterfall',
    steps,
    times,
    total: steps.reduce((sum, step) => sum + step.value, 0),
    notes: [],
  }
}

export function funnel(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const yi = index(data, spec.y[0] ?? null)
  return {
    kind: 'funnel',
    stages: data.rows.map((row) => ({ name: label(row[xi]), value: num(row[yi]) ?? 0 })),
    notes: [],
  }
}

/** Biggest first; beyond `keep`, the rest add up to one "Other" tile. */
function capLeaves(leaves: TreeNode[], keep: number): { nodes: TreeNode[]; dropped: number } {
  const sorted = [...leaves].sort((a, b) => b.value - a.value)
  if (sorted.length <= keep) return { nodes: sorted, dropped: 0 }
  const rest = sorted.slice(keep - 1)
  const other = rest.reduce((sum, node) => sum + node.value, 0)
  return {
    nodes: [...sorted.slice(0, keep - 1), { name: OTHER, value: other, other: true }],
    dropped: rest.length,
  }
}

export function treemap(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const si = index(data, spec.series)
  const yi = index(data, spec.y[0] ?? null)
  const leafOf = (row: CellValue[]): TreeNode => ({
    name: label(row[xi]),
    value: Math.max(0, num(row[yi]) ?? 0),
  })
  const notes: string[] = []
  const noun = pluralize(humanizeName(spec.x ?? '').toLowerCase())
  let nodes: TreeNode[]
  if (si < 0) {
    const capped = capLeaves(data.rows.map(leafOf), MAX_TREEMAP_LEAVES)
    nodes = capped.nodes
    if (capped.dropped > 0) {
      notes.push(
        `The ${formatNumber(capped.dropped, 'en-US')} smallest ${noun} are combined as Other.`,
      )
    }
  } else {
    const groups = new Map<string, TreeNode[]>()
    for (const row of data.rows) {
      const parent = label(row[si])
      if (!groups.has(parent)) groups.set(parent, [])
      groups.get(parent)?.push(leafOf(row))
    }
    nodes = [...groups.entries()]
      .map(([name, leaves]) => {
        const children = capLeaves(leaves, MAX_LEAVES_PER_GROUP).nodes
        return { name, value: children.reduce((sum, node) => sum + node.value, 0), children }
      })
      .sort((a, b) => b.value - a.value)
  }
  return { kind: 'treemap', nodes, total: nodes.reduce((sum, node) => sum + node.value, 0), notes }
}

export function boxplot(spec: ChartSpec, data: ChartData): Prepared {
  const stat = (row: CellValue[], i: number) => num(row[i]) ?? 0
  if (data.sampling === 'quantiles') {
    // Columns: group, low, q1, median, q3, high, n, groups, outliers (engine/chartData.ts).
    const groups = data.rows.map((row) => ({
      name: label(row[0]),
      stats: [stat(row, 1), stat(row, 2), stat(row, 3), stat(row, 4), stat(row, 5)] as [
        number,
        number,
        number,
        number,
        number,
      ],
      count: num(row[6]),
      outliers: num(row[8]),
    }))
    const total = num(data.rows[0]?.[7]) ?? groups.length
    const noun = pluralize(humanizeName(spec.x ?? '').toLowerCase())
    const beyond = groups.reduce((sum, group) => sum + (group.outliers ?? 0), 0)
    const notes = [
      total > groups.length
        ? `Showing the ${groups.length} ${noun} with the most rows, of ${formatNumber(total, 'en-US')}.`
        : null,
      beyond > 0
        ? `${formatNumber(beyond, 'en-US')} ${beyond === 1 ? 'value lies' : 'values lie'} beyond the whiskers (1.5× the box's height) and ${beyond === 1 ? "isn't" : "aren't"} drawn.`
        : null,
    ].filter((note): note is string => note !== null)
    return { kind: 'boxplot', groups, notes }
  }
  // Quartile columns already in the result: low, q1, median, q3, high (build/more.ts).
  const xi = index(data, spec.x)
  const columns = spec.y.map((name) => index(data, name))
  const groups = data.rows.map((row) => {
    const values = columns.map((i) => stat(row, i))
    return {
      name: label(row[xi]),
      stats: [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0, values[4] ?? 0] as [
        number,
        number,
        number,
        number,
        number,
      ],
      count: null,
      outliers: null,
    }
  })
  return { kind: 'boxplot', groups, notes: [] }
}

export function sankey(spec: ChartSpec, data: ChartData): Prepared {
  const si = index(data, spec.x)
  const ti = index(data, spec.series)
  const yi = index(data, spec.y[0] ?? null)
  const nodes = new Map<string, { id: string; name: string; side: 'source' | 'target' }>()
  // Each side gets its own node, so a name can appear on both (A → A) without a cycle.
  const node = (side: 'source' | 'target', name: string) => {
    const id = `${side === 'source' ? 'from' : 'to'}:${name}`
    if (!nodes.has(id)) nodes.set(id, { id, name, side })
    return id
  }
  const links = data.rows
    .map((row) => ({
      source: node('source', label(row[si])),
      target: node('target', label(row[ti])),
      value: Math.max(0, num(row[yi]) ?? 0),
    }))
    .filter((link) => link.value > 0)
  return { kind: 'sankey', nodes: [...nodes.values()], links, notes: [] }
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function calendar(spec: ChartSpec, data: ChartData): Prepared {
  const xi = index(data, spec.x)
  const yi = index(data, spec.y[0] ?? null)
  const days = data.rows
    .map((row): [string, number | null] => [String(row[xi] ?? '').slice(0, 10), num(row[yi])])
    .filter(([day]) => parseIsoUtc(day) !== null)
    .sort((a, b) => a[0].localeCompare(b[0]))
  const values = days.map(([, value]) => value).filter((value): value is number => value !== null)
  const ranges: [string, string][] = []
  const first = days[0] ? parseIsoUtc(days[0][0])?.getTime() : undefined
  const last = days.at(-1) ? parseIsoUtc(days.at(-1)?.[0] ?? '')?.getTime() : undefined
  if (first !== undefined && last !== undefined) {
    for (let start = first; start <= last; start += 366 * DAY_MS) {
      ranges.push([isoDay(start), isoDay(Math.min(last, start + 365 * DAY_MS))])
    }
  }
  return {
    kind: 'calendar',
    days,
    ranges,
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
    notes: [],
  }
}
