import type { CellValue, ColumnMeta } from '@/engine/types'
import type { ChartSpec } from '@/charts/spec'
import { parseIsoUtc } from '@/lib/format'

// Chart data and its shaped forms (F-VIZ-04): what src/charts/shape.ts and shapeMore.ts produce
// and toOption.ts draws, plus the small helpers they share. Pure.

export interface ChartData {
  columns: ColumnMeta[]
  rows: CellValue[][]
  /** Rows the whole query result has. */
  rowCount: number
  /**
   * How `rows` relate to the result: all of it, a random sample (scatter), every n-th row (long
   * lines), histogram bins (columns bin_start, bin_end, count), box plot statistics per group
   * (columns group, low, q1, median, q3, high, n, groups), or just the first rows.
   */
  sampling: 'none' | 'sample' | 'step' | 'bins' | 'quantiles' | 'head'
}

/** Beyond this many x categories, grouped and stacked bars keep the top ones and add "Other". */
export const MAX_CATEGORIES = 12
export const OTHER = 'Other'

export interface NamedValues {
  name: string
  values: (number | null)[]
  other: boolean
}

export interface KpiItem {
  label: string
  value: number | null
  /** KPI with a trend (F-VIZ-10): the value the period before, and every value in time order. */
  previous?: number | null
  trend?: (number | null)[]
}

export interface TreeNode {
  name: string
  value: number
  children?: TreeNode[]
  other?: boolean
}

export type Prepared =
  | {
      kind: 'kpi'
      items: KpiItem[]
      caption: string | null
      /** KPI with a trend: when the latest and previous values are from (epoch ms, or labels). */
      period?: { latest: number | string; previous: number | string | null; spanMs: number }
    }
  | {
      kind: 'category'
      categories: string[]
      series: NamedValues[]
      notes: string[]
      /** When the categories are moments in time: epoch ms of each, for date labels. */
      times?: number[]
    }
  | {
      kind: 'combo'
      categories: string[]
      times: number[] | null
      bars: NamedValues
      line: NamedValues
      notes: string[]
    }
  | {
      kind: 'waterfall'
      steps: { name: string; value: number }[]
      times: number[] | null
      total: number
      notes: string[]
    }
  | { kind: 'funnel'; stages: { name: string; value: number }[]; notes: string[] }
  | { kind: 'treemap'; nodes: TreeNode[]; total: number; notes: string[] }
  | {
      kind: 'boxplot'
      groups: {
        name: string
        /** Low, first quartile, median, third quartile, high. */
        stats: [number, number, number, number, number]
        count: number | null
        /** Values beyond the whiskers (not drawn), when computed in the database. */
        outliers: number | null
      }[]
      notes: string[]
    }
  | {
      kind: 'sankey'
      nodes: { id: string; name: string; side: 'source' | 'target' }[]
      links: { source: string; target: string; value: number }[]
      notes: string[]
    }
  | {
      kind: 'calendar'
      /** [YYYY-MM-DD, value], in date order. */
      days: [string, number | null][]
      /** One calendar per range of at most a year. */
      ranges: [string, string][]
      min: number
      max: number
      notes: string[]
    }
  | {
      kind: 'time'
      axis: 'time' | 'category'
      /** Category axis only. */
      categories: string[]
      series: { name: string; points: [number | string, number | null][]; other: boolean }[]
      /** Time axis: first to last point, in ms. */
      spanMs: number
      notes: string[]
    }
  | { kind: 'pie'; slices: { name: string; value: number }[]; notes: string[] }
  | {
      kind: 'scatter'
      series: { name: string; points: [number, number, number | null][] }[]
      sizeRange: [number, number] | null
      notes: string[]
    }
  | { kind: 'bins'; bins: { start: number; end: number; count: number }[]; notes: string[] }
  | {
      kind: 'heatmap'
      xs: string[]
      ys: string[]
      cells: [number, number, number | null][]
      min: number
      max: number
      notes: string[]
    }
  | { kind: 'table' }

export const index = (data: ChartData, name: string | null) =>
  name === null ? -1 : data.columns.findIndex((column) => column.name === name)

export const num = (value: CellValue | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export function label(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '(blank)'
  return String(value)
}

const ISO = /^\d{4}-\d{2}(-\d{2})?([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/

/** Epoch ms for dates, timestamps and ISO text; null for anything else (years stay labels). */
export function timeValue(
  value: CellValue | undefined,
  column: ColumnMeta | undefined,
): number | null {
  if (typeof value !== 'string' || !column) return null
  if (column.logicalType !== 'date' && column.logicalType !== 'timestamp' && !ISO.test(value)) {
    return null
  }
  const date = parseIsoUtc(value.length === 7 ? `${value}-01` : value)
  return date ? date.getTime() : null
}

export function sortCategories(
  categories: string[],
  totals: Map<string, number>,
  sort: ChartSpec['sort'],
): string[] {
  if (sort === 'none') return categories
  const sign = sort === 'desc' ? -1 : 1
  return [...categories].sort((a, b) => sign * ((totals.get(a) ?? 0) - (totals.get(b) ?? 0)))
}

/** Keeps the `keep` largest names; the rest become one "Other" (summed when additive). */
export function topN(
  names: string[],
  weight: (name: string) => number,
  keep: number,
): { kept: string[]; rest: Set<string> } {
  if (names.length <= keep + 1) return { kept: names, rest: new Set() }
  const ranked = [...names].sort((a, b) => Math.abs(weight(b)) - Math.abs(weight(a)))
  const kept = new Set(ranked.slice(0, keep))
  return { kept: names.filter((name) => kept.has(name)), rest: new Set(ranked.slice(keep)) }
}
