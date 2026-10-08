import type { ChartHint } from '@/ai/schemas'
import { valueStyle, type ColumnInfo, type ResultShape } from '@/charts/classify'
import type { ChartSpec, ChartType } from '@/charts/spec'
import type { CellValue, ColumnMeta } from '@/engine/types'
import { formatNumber, humanizeName, pluralize } from '@/lib/format'

// Shared pieces of chart choice (F-VIZ-01): limits, the context a spec is built in, preferred
// columns, and the helpers every builder uses (src/charts/build/basic.ts, more.ts). Pure.

/** Charts get at most this many points; bigger results are sampled or binned in SQL (F-VIZ-05). */
export const CHART_POINT_LIMIT = 5_000
export const MAX_BARS = 30
export const MAX_DONUT_SLICES = 6
export const MAX_SERIES = 8
export const MAX_HEATMAP_SIDE = 50
export const MAX_KPIS = 6

export interface ChartInput {
  columns: ColumnMeta[]
  /** The first rows of the result (all of them when it has ≤ CHART_POINT_LIMIT rows). */
  rows: CellValue[][]
  rowCount: number
  question?: string
  hint?: ChartHint | null
  /** Chart title; defaults to "<y> by <x>". */
  title?: string
  /** Currency for money columns (settings), or null. */
  currency?: string | null
}

export interface SpecContext {
  question: string
  title: string | null
  currency: string | null
}

/** Columns to use when they fit: from the AI hint, the current chart, or the settings popover. */
export interface PreferredColumns {
  x?: string | null
  y?: string[]
  series?: string | null
  size?: string | null
}

export type BuildResult = { ok: true; spec: ChartSpec } | { ok: false; reason: string }

export const DONUT_INTENT =
  /\b(share|shares|proportion|percentage|percent|breakdown|composition|split|mix|makes? up|contribut\w*)\b/i
export const SHARE_NAME = /(share|proportion|pct_of|percent_of)/i
export const CUMULATIVE_NAME = /(cumulative|running|cum_|ytd|to_date)/i

export const word = (name: string) => humanizeName(name).toLowerCase()
export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
export const count = (n: number, noun: string) =>
  `${formatNumber(n, 'en-US')} ${n === 1 ? noun : pluralize(noun)}`
export const listOf = (columns: ColumnInfo[]) => {
  const words = columns.map((column) => word(column.name))
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

export function fail(reason: string): BuildResult {
  return { ok: false, reason }
}

export function find(
  columns: ColumnInfo[],
  name: string | null | undefined,
): ColumnInfo | undefined {
  return name ? columns.find((column) => column.name === name) : undefined
}

/** The measure the question names ("profit margin" → profit_margin), or undefined. */
export function askedMeasure(measures: ColumnInfo[], question: string): ColumnInfo | undefined {
  const asked = question.toLowerCase()
  let best: { column: ColumnInfo; score: number } | undefined
  for (const column of measures) {
    const words = word(column.name)
      .split(' ')
      .filter((w) => w.length > 2 && !['total', 'sum', 'avg', 'count'].includes(w))
    const score = words.filter((w) => asked.includes(w.replace(/s$/, ''))).length
    if (score > 0 && (!best || score >= best.score)) best = { column, score }
  }
  return best?.column
}

/** The measure the question is about; else the last one. */
export function focusMeasure(measures: ColumnInfo[], question: string): ColumnInfo | undefined {
  return askedMeasure(measures, question) ?? measures.at(-1)
}

export function measuresFor(
  shape: ResultShape,
  preferred: string[] | undefined,
  max: number,
): ColumnInfo[] {
  const chosen = (preferred ?? [])
    .map((name) => find(shape.measures, name))
    .filter((column): column is ColumnInfo => column !== undefined)
  return (chosen.length > 0 ? chosen : shape.measures).slice(0, max)
}

export function baseSpec(
  type: ChartType,
  shape: ResultShape,
  ctx: SpecContext,
  parts: {
    x: ColumnInfo | null
    y: ColumnInfo[]
    series?: ColumnInfo | null
    size?: ColumnInfo | null
    sort?: ChartSpec['sort']
    stacked?: boolean
    reason: string
  },
): ChartSpec {
  const y = parts.y
  const title =
    ctx.title ??
    (parts.x && y[0]
      ? `${humanizeName(y[0].name)} by ${word(parts.x.name)}`
      : humanizeName(y[0]?.name ?? 'result'))
  return {
    type,
    x: parts.x?.name ?? null,
    y: y.map((column) => column.name),
    series: parts.series?.name ?? null,
    size: parts.size?.name ?? null,
    sort: parts.sort ?? 'none',
    stacked: parts.stacked ?? false,
    logScale: false,
    labels: false,
    format: valueStyle(y[0], shape, ctx.currency),
    title,
    reason: parts.reason,
  }
}

export const labelColumns = (shape: ResultShape) => [...shape.categories, ...shape.temporal]

export function tableSpec(shape: ResultShape, ctx: SpecContext, reason: string): ChartSpec {
  return baseSpec('table', shape, ctx, { x: null, y: [], reason })
}
