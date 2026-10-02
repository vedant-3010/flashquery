import type { ColumnFilter } from '@/engine/gridFilters'
import { formatDate, formatNumber } from '@/lib/format'

// Active-filter chips (F-GRID-04): "region is APAC or Europe", "revenue 100–500".

export function filterLabel(filter: ColumnFilter, locale: string): string {
  const name = filter.column
  switch (filter.kind) {
    case 'contains':
      return `${name} contains “${filter.text}”`
    case 'range': {
      const min = filter.min === null ? null : formatNumber(filter.min, locale)
      const max = filter.max === null ? null : formatNumber(filter.max, locale)
      if (min !== null && max !== null) return `${name} ${min}–${max}`
      return min !== null ? `${name} ≥ ${min}` : `${name} ≤ ${max ?? ''}`
    }
    case 'dates': {
      const from = filter.from && formatDate(filter.from, locale)
      const to = filter.to && formatDate(filter.to, locale)
      if (from && to) return `${name} ${from}–${to}`
      return from ? `${name} from ${from}` : `${name} until ${to ?? ''}`
    }
    case 'values': {
      const values = filter.values.map((value) => value ?? 'null')
      const shown = values.slice(0, 3).join(' or ')
      return values.length > 3 ? `${name} is ${shown} +${values.length - 3}` : `${name} is ${shown}`
    }
  }
}
