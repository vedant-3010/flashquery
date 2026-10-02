import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  clickCell,
  clickRow,
  moveSelection,
  rangeOf,
  type Selection,
  type SelectionRange,
} from '@/features/grid/selection'

export interface CopyRequest {
  firstRow: number
  lastRow: number
  /** Visible column names, in display order. */
  columns: string[]
}

/**
 * Cell selection and copy in the grid (F-GRID-05): click, Shift-click, row numbers, arrow keys,
 * Esc to clear and Ctrl/Cmd+C to copy. A new grid shape (rows, columns) clears the selection.
 */
export function useGridSelection({
  rowCount,
  columns,
  onCopy,
  scrollTo,
}: {
  rowCount: number
  columns: string[]
  onCopy?: (request: CopyRequest) => void
  scrollTo: (row: number, col: number) => void
}) {
  const shape = `${rowCount}|${columns.join('\u0001')}`
  const [state, setState] = useState<{ shape: string; selection: Selection } | null>(null)
  const selection = state?.shape === shape ? state.selection : null
  const select = (next: Selection | null) => setState(next ? { shape, selection: next } : null)
  const range: SelectionRange | null = selection ? rangeOf(selection) : null

  const copy = () => {
    if (!range || !onCopy) return
    onCopy({
      firstRow: range.firstRow,
      lastRow: range.lastRow,
      columns: columns.slice(range.firstCol, range.lastCol + 1),
    })
  }

  return {
    range,
    onCellMouseDown: (row: number, col: number, event: MouseEvent) => {
      if (event.button !== 0) return
      if (event.shiftKey) event.preventDefault() // no text selection while extending
      select(clickCell(selection, { row, col }, event.shiftKey))
    },
    onRowHeaderMouseDown: (row: number, event: MouseEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      select(clickRow(selection, row, columns.length, event.shiftKey))
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (!selection) return
      if (event.key === 'Escape') {
        select(null)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        if (window.getSelection()?.toString()) return // the user selected text: copy that
        event.preventDefault()
        copy()
        return
      }
      const moved = moveSelection(selection, event.key, event.shiftKey, {
        rows: rowCount,
        columns: columns.length,
      })
      if (!moved) return
      event.preventDefault()
      select(moved)
      scrollTo(moved.focus.row, moved.focus.col)
    },
    copy,
  }
}
