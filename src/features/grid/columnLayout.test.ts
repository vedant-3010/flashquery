import { describe, expect, it } from 'vitest'
import { layoutFor, moveColumn, visibleColumns } from './columnLayout'

describe('column layout (F-GRID-05)', () => {
  it('hides and reorders columns', () => {
    const order = moveColumn(['a', 'b', 'c'], 2, -1)
    expect(order).toEqual(['a', 'c', 'b'])
    expect(moveColumn(order, 0, -1)).toBe(order)
    expect(visibleColumns({ order, hidden: ['a'] })).toEqual(['c', 'b'])
  })

  it('drops a layout made for other columns', () => {
    const layout = { order: ['b', 'a'], hidden: ['a'] }
    expect(layoutFor(layout, ['a', 'b'])).toBe(layout)
    expect(layoutFor(layout, ['a', 'b', 'c'])).toEqual({ order: ['a', 'b', 'c'], hidden: [] })
    expect(layoutFor(null, ['x'])).toEqual({ order: ['x'], hidden: [] })
  })
})
