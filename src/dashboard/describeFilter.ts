import type { DashboardFilter } from '@/engine/filters'
import { humanizeName } from '@/lib/format'

/** A dashboard filter as its chip reads: "Region: APAC, MEA", "Order date: from 2024-01-01". */
export function describeFilter(filter: DashboardFilter): string {
  const name = humanizeName(filter.column)
  if (filter.kind === 'date') {
    if (filter.from && filter.to) return `${name}: ${filter.from} – ${filter.to}`
    return filter.from ? `${name}: from ${filter.from}` : `${name}: until ${filter.to ?? ''}`
  }
  const shown = filter.values.slice(0, 3).map((v) => (v === null ? '(blank)' : String(v)))
  const more = filter.values.length > 3 ? ` +${filter.values.length - 3}` : ''
  return `${name}: ${shown.join(', ')}${more}`
}
