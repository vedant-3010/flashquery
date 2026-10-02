import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import { elementScroll, observeElementOffset, useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import type { SortSpec } from '@/engine/paging'
import { isIdentifierLike } from '@/engine/roles'
import type { CellValue, ColumnMeta, ColumnProfile } from '@/engine/types'
import { defaultWidth } from '@/features/grid/columnWidth'
import { GridCell } from '@/features/grid/GridCell'
import { GridHeaderCell } from '@/features/grid/GridHeaderCell'
import { contains } from '@/features/grid/selection'
import type { GridRows } from '@/features/grid/useGridRows'
import { useGridSelection, type CopyRequest } from '@/features/grid/useGridSelection'
import type { CellFormat } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

// Virtualized grid over a paged DuckDB result (F-GRID-01..03). TanStack Table owns columns,
// sorting (manual: pushed down as ORDER BY) and resizing; TanStack Virtual renders only the rows
// and columns in view. Rows come from a page cache; missing rows show as skeletons.

const features = tableFeatures({ rowSortingFeature, columnSizingFeature, columnResizingFeature })
type GridRow = CellValue[]
const helper = createColumnHelper<typeof features, GridRow>()
const NO_ROWS: GridRow[] = []

const ROW_HEIGHT = 28
const HEADER_HEIGHT = 32
/**
 * Browsers cap element height (Firefox at ~17.9M px, and 1M rows × 28 px is 28M px). Taller grids
 * use a spacer of this height and scale the scroll offset (see observeElementOffset below).
 */
const MAX_SCROLL_HEIGHT = 15_000_000

interface DataGridProps {
  label: string
  columns: ColumnMeta[]
  rowCount: number
  rows: GridRows
  sorting: SortSpec[]
  onSortingChange: (sorting: SortSpec[]) => void
  profiles?: ReadonlyMap<string, ColumnProfile>
  /** Column names to show, in order (F-GRID-05); all columns when absent. */
  visibleColumns?: readonly string[]
  /** Copies selected cells (Ctrl/Cmd+C, F-GRID-05). */
  onCopy?: (request: CopyRequest) => void
  /** A filter control for a column's header (F-GRID-04). */
  filterFor?: (column: ColumnMeta) => ReactNode
}

export function DataGrid({
  label,
  columns,
  rowCount,
  rows,
  sorting,
  onSortingChange,
  profiles,
  visibleColumns,
  onCopy,
  filterFor,
}: DataGridProps) {
  const locale = useSettingsStore((state) => state.locale)
  const dates = useSettingsStore((state) => state.dateDisplay)
  const scrollRef = useRef<HTMLDivElement>(null)

  const shown = useMemo(
    () =>
      visibleColumns
        ? visibleColumns.flatMap((name) => {
            const index = columns.findIndex((column) => column.name === name)
            const column = columns[index]
            return column ? [{ column, index }] : []
          })
        : columns.map((column, index) => ({ column, index })),
    [columns, visibleColumns],
  )
  const shownNames = useMemo(() => shown.map(({ column }) => column.name), [shown])
  const columnDefs = useMemo(
    () =>
      helper.columns(
        shown.map(({ column, index }) =>
          helper.accessor((row: GridRow) => row[index] ?? null, {
            id: column.name,
            header: column.name,
            size: defaultWidth(column),
            // The table holds no rows (they're paged), so set the first direction explicitly:
            // biggest numbers first, text and dates A→Z.
            sortDescFirst: column.logicalType === 'integer' || column.logicalType === 'number',
            minSize: 56,
            maxSize: 900,
          }),
        ),
      ),
    [shown],
  )
  const formats = useMemo(
    () =>
      new Map<string, { index: number; meta: ColumnMeta; format: CellFormat }>(
        columns.map((meta, index) => [
          meta.name,
          {
            index,
            meta,
            format: {
              logicalType: meta.logicalType,
              plainInteger: isIdentifierLike(meta.name),
              dates,
            },
          },
        ]),
      ),
    [columns, dates],
  )

  const tableSorting: SortingState = useMemo(
    () => sorting.map((sort) => ({ id: sort.column, desc: sort.desc })),
    [sorting],
  )
  const table = useTable({
    features,
    columns: columnDefs,
    data: NO_ROWS,
    manualSorting: true,
    enableMultiSort: true,
    enableSortingRemoval: true,
    columnResizeMode: 'onChange',
    state: { sorting: tableSorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(tableSorting) : updater
      onSortingChange(next.map((sort) => ({ column: sort.id, desc: sort.desc })))
    },
  })
  const leafColumns = table.getAllLeafColumns()
  const gutterWidth = Math.max(48, String(rowCount).length * 8 + 20)

  // Rows, with the scroll offset scaled when the grid is taller than MAX_SCROLL_HEIGHT.
  const totalHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT
  const scale = useRef(1)
  // TanStack Virtual isn't React Compiler-compatible; we don't use the compiler.
  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    paddingStart: HEADER_HEIGHT,
    overscan: 12,
    observeElementOffset: (instance, callback) =>
      observeElementOffset(instance, (offset, isScrolling) =>
        callback(offset * scale.current, isScrolling),
      ),
    scrollToFn: (offset, options, instance) =>
      elementScroll(offset / scale.current, options, instance),
  })
  const viewport = rowVirtualizer.scrollRect?.height ?? 0
  const spacerHeight = Math.min(totalHeight, MAX_SCROLL_HEIGHT)
  const nextScale =
    totalHeight > spacerHeight && spacerHeight > viewport
      ? (totalHeight - viewport) / (spacerHeight - viewport)
      : 1
  useLayoutEffect(() => {
    scale.current = nextScale
  }, [nextScale])
  const virtualOffset = rowVirtualizer.scrollOffset ?? 0
  // Where a row starts inside the spacer: the real scroll position plus its distance from the top
  // of the (virtual) viewport. Equals item.start when nothing is scaled.
  const rowTop = (start: number) => virtualOffset / nextScale + (start - virtualOffset)

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: leafColumns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => leafColumns[index]?.getSize() ?? 150,
    paddingStart: gutterWidth,
    overscan: 3,
  })
  const columnSizing = table.state.columnSizing
  useEffect(() => columnVirtualizer.measure(), [columnSizing, columnVirtualizer, gutterWidth])

  const virtualRows = rowVirtualizer.getVirtualItems()
  const virtualColumns = columnVirtualizer.getVirtualItems()
  const contentWidth = columnVirtualizer.getTotalSize()
  const padLeft = (virtualColumns[0]?.start ?? gutterWidth) - gutterWidth
  const padRight = contentWidth - (virtualColumns.at(-1)?.end ?? gutterWidth)

  const first = virtualRows[0]?.index ?? 0
  const last = virtualRows.at(-1)?.index ?? 0
  const direction = rowVirtualizer.scrollDirection === 'backward' ? 'backward' : 'forward'
  useEffect(() => {
    if (rowCount > 0) rows.request(first, last, direction)
  }, [rows, first, last, direction, rowCount])

  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const selection = useGridSelection({
    rowCount,
    columns: shownNames,
    onCopy,
    scrollTo: (row, col) => {
      rowVirtualizer.scrollToIndex(row)
      columnVirtualizer.scrollToIndex(col)
    },
  })
  const range = selection.range

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={label}
      aria-rowcount={rowCount + 1}
      aria-colcount={leafColumns.length}
      aria-multiselectable
      tabIndex={0}
      onKeyDown={selection.onKeyDown}
      className="relative min-h-0 flex-1 overflow-auto text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      <div className="relative" style={{ width: contentWidth, height: spacerHeight }}>
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-20 flex border-b bg-background"
          style={{ height: HEADER_HEIGHT, width: contentWidth }}
        >
          <div
            className="sticky left-0 z-10 shrink-0 border-r bg-background"
            style={{ width: gutterWidth }}
          />
          <div className="shrink-0" style={{ width: padLeft }} />
          {virtualColumns.map((virtualColumn) => {
            const header = headers[virtualColumn.index]
            const entry = header && formats.get(header.column.id)
            if (!header || !entry) return null
            const sortIndex = header.column.getSortIndex()
            return (
              <GridHeaderCell
                key={header.id}
                meta={entry.meta}
                width={header.getSize()}
                sorted={header.column.getIsSorted()}
                sortPosition={sorting.length > 1 && sortIndex >= 0 ? sortIndex + 1 : null}
                onSort={header.column.getToggleSortingHandler()}
                onResize={header.getResizeHandler()}
                onResetSize={() => header.column.resetSize()}
                resizing={header.column.getIsResizing()}
                profile={profiles?.get(header.column.id)}
                rowCount={rowCount}
                filter={filterFor?.(entry.meta)}
              />
            )
          })}
          <div className="shrink-0" style={{ width: padRight }} />
        </div>

        {virtualRows.map((virtualRow) => {
          const row = rows.getRow(virtualRow.index)
          return (
            <div
              key={virtualRow.index}
              role="row"
              aria-rowindex={virtualRow.index + 2}
              className="absolute top-0 left-0 flex border-b border-border/50 hover:bg-muted/40"
              style={{
                height: ROW_HEIGHT,
                width: contentWidth,
                transform: `translateY(${rowTop(virtualRow.start)}px)`,
              }}
            >
              <div
                role="rowheader"
                className="sticky left-0 z-10 flex shrink-0 cursor-pointer items-center justify-end border-r bg-background pr-2 text-muted-foreground tabular-nums select-none"
                style={{ width: gutterWidth }}
                onMouseDown={(event) => selection.onRowHeaderMouseDown(virtualRow.index, event)}
              >
                {virtualRow.index + 1}
              </div>
              <div className="shrink-0" style={{ width: padLeft }} />
              {virtualColumns.map((virtualColumn) => {
                const column = leafColumns[virtualColumn.index]
                const entry = column && formats.get(column.id)
                if (!column || !entry) return null
                const selected =
                  range !== null && contains(range, virtualRow.index, virtualColumn.index)
                return (
                  <GridCell
                    key={column.id}
                    row={row}
                    value={row?.[entry.index]}
                    format={entry.format}
                    locale={locale}
                    selected={selected}
                    width={column.getSize()}
                    onMouseDown={(event) =>
                      selection.onCellMouseDown(virtualRow.index, virtualColumn.index, event)
                    }
                  />
                )
              })}
              <div className="shrink-0" style={{ width: padRight }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
