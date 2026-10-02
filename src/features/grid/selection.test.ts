import { describe, expect, it } from 'vitest'
import { clickCell, clickRow, contains, moveSelection, rangeOf } from './selection'

describe('grid selection (F-GRID-05)', () => {
  it('selects a cell and extends a rectangle with Shift', () => {
    const one = clickCell(null, { row: 5, col: 2 }, false)
    const range = rangeOf(clickCell(one, { row: 1, col: 3 }, true))
    expect(range).toEqual({ firstRow: 1, lastRow: 5, firstCol: 2, lastCol: 3 })
    expect(contains(range, 3, 2)).toBe(true)
    expect(contains(range, 3, 4)).toBe(false)
  })

  it('selects whole rows from the row numbers', () => {
    const rows = clickRow(clickRow(null, 4, 6, false), 7, 6, true)
    expect(rangeOf(rows)).toEqual({ firstRow: 4, lastRow: 7, firstCol: 0, lastCol: 5 })
  })

  it('moves with arrow keys inside the grid; Shift extends', () => {
    const start = clickCell(null, { row: 0, col: 0 }, false)
    const bounds = { rows: 10, columns: 3 }
    expect(moveSelection(start, 'ArrowUp', false, bounds)?.focus).toEqual({ row: 0, col: 0 })
    const down = moveSelection(start, 'ArrowDown', true, bounds)
    expect(down && rangeOf(down)).toEqual({ firstRow: 0, lastRow: 1, firstCol: 0, lastCol: 0 })
    expect(moveSelection(start, 'Enter', false, bounds)).toBeNull()
  })
})
