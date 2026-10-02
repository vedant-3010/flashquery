// Column visibility and order in the grid (F-GRID-05). Pure.

export interface ColumnLayout {
  /** Every column, in display order. */
  order: string[]
  hidden: string[]
}

export function visibleColumns(layout: ColumnLayout): string[] {
  return layout.order.filter((name) => !layout.hidden.includes(name))
}

/** Moves the column at `index` one place left (-1) or right (1). */
export function moveColumn(order: string[], index: number, by: -1 | 1): string[] {
  const target = index + by
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return order
  const next = [...order]
  const [item] = next.splice(index, 1)
  if (item !== undefined) next.splice(target, 0, item)
  return next
}

/** `layout` when it has exactly `columns`; otherwise the columns in their own order. */
export function layoutFor(layout: ColumnLayout | null, columns: string[]): ColumnLayout {
  const same =
    layout !== null &&
    layout.order.length === columns.length &&
    columns.every((name) => layout.order.includes(name))
  return same ? layout : { order: columns, hidden: [] }
}
