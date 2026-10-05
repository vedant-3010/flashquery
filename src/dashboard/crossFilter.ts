import { OTHER } from '@/charts/shape'
import type { DashboardTile } from '@/dashboard/schema'
import { MAX_VALUE_FILTERS, type DashboardFilter } from '@/engine/filters'
import type { DatasetProfile } from '@/engine/types'

// Cross-filtering (F-DASH-11): clicking a bar or slice filters the whole dashboard by that
// category. It works when the chart's category column is a real column of a table the tile reads
// (not a computed label such as a month bucket); the filter is an ordinary dashboard value filter,
// so the filter bar shows it and refreshes every tile. Pure.

const CLICKABLE = new Set(['bar', 'hbar', 'grouped_bar', 'stacked_bar', 'donut'])

/** The table column a click on this tile's chart filters, or null when there is none. */
export function crossFilterTarget(
  tile: DashboardTile,
  datasets: readonly DatasetProfile[],
): { table: string; column: string } | null {
  const spec = tile.chartSpec
  if (tile.type !== 'chart' || !spec || !CLICKABLE.has(spec.type) || !spec.x) return null
  for (const ref of tile.datasetRefs) {
    const dataset = datasets.find((d) => d.table === ref.table)
    if (dataset?.columns.some((column) => column.name === spec.x)) {
      return { table: ref.table, column: spec.x }
    }
  }
  return null
}

export type CrossFilterResult =
  { ok: true; filters: DashboardFilter[]; cleared: boolean } | { ok: false; reason: string }

/** The dashboard's filters after clicking `value`: set the filter, or clear it on a second click. */
export function toggleCrossFilter(
  filters: readonly DashboardFilter[],
  target: { table: string; column: string },
  value: string,
): CrossFilterResult {
  if (value === OTHER) return { ok: false, reason: '"Other" groups several values: pick one bar.' }
  const same = (f: DashboardFilter) => f.table === target.table && f.column === target.column
  const existing = filters.find(same)
  const rest = filters.filter((f) => !same(f))
  if (existing?.kind === 'values' && existing.values.length === 1 && existing.values[0] === value) {
    return { ok: true, filters: rest, cleared: true }
  }
  if (rest.filter((f) => f.kind === 'values').length >= MAX_VALUE_FILTERS) {
    return { ok: false, reason: `A dashboard has at most ${MAX_VALUE_FILTERS} value filters.` }
  }
  return {
    ok: true,
    filters: [
      ...rest,
      { kind: 'values', table: target.table, column: target.column, values: [value] },
    ],
    cleared: false,
  }
}
