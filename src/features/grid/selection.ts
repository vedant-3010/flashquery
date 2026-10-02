// Grid cell selection (F-GRID-05): an anchor and a focus cell; the selection is the rectangle
// between them. Rows are row indexes in the grid's order, columns are visible column positions.
// Pure.

export interface CellPosition {
  row: number
  col: number
}

export interface Selection {
  anchor: CellPosition
  focus: CellPosition
}

export interface SelectionRange {
  firstRow: number
  lastRow: number
  firstCol: number
  lastCol: number
}

export function rangeOf({ anchor, focus }: Selection): SelectionRange {
  return {
    firstRow: Math.min(anchor.row, focus.row),
    lastRow: Math.max(anchor.row, focus.row),
    firstCol: Math.min(anchor.col, focus.col),
    lastCol: Math.max(anchor.col, focus.col),
  }
}

export function contains(range: SelectionRange, row: number, col: number): boolean {
  return (
    row >= range.firstRow && row <= range.lastRow && col >= range.firstCol && col <= range.lastCol
  )
}

/** Clicking a cell selects it; with Shift it extends the selection from the anchor. */
export function clickCell(
  selection: Selection | null,
  cell: CellPosition,
  extend: boolean,
): Selection {
  return extend && selection
    ? { anchor: selection.anchor, focus: cell }
    : { anchor: cell, focus: cell }
}

/** Clicking a row number selects whole rows. */
export function clickRow(
  selection: Selection | null,
  row: number,
  columns: number,
  extend: boolean,
): Selection {
  const last = Math.max(0, columns - 1)
  if (extend && selection) {
    return { anchor: { row: selection.anchor.row, col: 0 }, focus: { row, col: last } }
  }
  return { anchor: { row, col: 0 }, focus: { row, col: last } }
}

const STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

/** Arrow keys move the focus cell (Shift extends); null for keys that don't move. */
export function moveSelection(
  selection: Selection,
  key: string,
  extend: boolean,
  bounds: { rows: number; columns: number },
): Selection | null {
  const step = STEPS[key]
  if (!step || bounds.rows === 0 || bounds.columns === 0) return null
  const focus = {
    row: Math.min(bounds.rows - 1, Math.max(0, selection.focus.row + step[0])),
    col: Math.min(bounds.columns - 1, Math.max(0, selection.focus.col + step[1])),
  }
  return extend ? { anchor: selection.anchor, focus } : { anchor: focus, focus }
}
