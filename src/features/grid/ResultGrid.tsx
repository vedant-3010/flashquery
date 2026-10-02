import { TriangleAlert, X } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { getDb } from '@/engine/duckdb'
import { columnValues, setFilter, type ColumnFilter } from '@/engine/gridFilters'
import { fetchPage, type PagedResult, type SortSpec } from '@/engine/paging'
import type { ColumnMeta, ColumnProfile } from '@/engine/types'
import { ColumnFilterPopover } from '@/features/grid/ColumnFilterPopover'
import { layoutFor, visibleColumns, type ColumnLayout } from '@/features/grid/columnLayout'
import { ColumnsMenu } from '@/features/grid/ColumnsMenu'
import { DataGrid } from '@/features/grid/DataGrid'
import { ExportMenu } from '@/features/grid/ExportMenu'
import { filterLabel } from '@/features/grid/filterLabel'
import { useGridRows } from '@/features/grid/useGridRows'
import type { CopyRequest } from '@/features/grid/useGridSelection'
import { toAppError } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { field, toTsv, TSV_MAX_ROWS } from '@/lib/tsv'
import { useSettingsStore } from '@/stores/settings'

interface ResultGridProps {
  result: PagedResult
  label: string
  /** File name (without extension) for exports. */
  exportName: string
  profiles?: ReadonlyMap<string, ColumnProfile>
}

interface GridBodyProps {
  result: PagedResult
  label: string
  profiles?: ReadonlyMap<string, ColumnProfile>
  sorting: SortSpec[]
  onSortingChange: (sorting: SortSpec[]) => void
  filters: ColumnFilter[]
  visible: string[]
  filterFor: (column: ColumnMeta) => ReactNode
  onCopy: (request: CopyRequest) => void
  onRetry: () => void
  footer: (rowCount: number | null) => ReactNode
}

function GridBody({ result, sorting, filters, onRetry, footer, visible, ...props }: GridBodyProps) {
  const { rows, rowCount, error } = useGridRows(result, sorting, filters)
  if (error) {
    return (
      <EmptyState icon={TriangleAlert} title="Couldn't load rows" description={error.message}>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </EmptyState>
    )
  }
  return (
    <>
      <DataGrid
        {...props}
        columns={result.columns}
        visibleColumns={visible}
        rowCount={rowCount ?? 0}
        rows={rows}
        sorting={sorting}
      />
      {rowCount === 0 && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {filters.length > 0 ? 'No rows match the filters.' : 'No rows.'}
        </p>
      )}
      {footer(rowCount)}
    </>
  )
}

/**
 * A paged result in the virtual grid (M2): sorting, column filters (F-GRID-04), column visibility
 * and order, copying selected cells (F-GRID-05), a status line and export.
 */
export function ResultGrid({ result, label, exportName, profiles }: ResultGridProps) {
  const locale = useSettingsStore((state) => state.locale)
  const dates = useSettingsStore((state) => state.dateDisplay)
  const setDates = useSettingsStore((state) => state.setDateDisplay)
  const [sorting, setSorting] = useState<SortSpec[]>([])
  const [filters, setFilters] = useState<ColumnFilter[]>([])
  const original = useMemo(() => result.columns.map((column) => column.name), [result])
  const [layout, setLayout] = useState<ColumnLayout | null>(null)
  // A new key remounts the body with an empty page cache.
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('')
  const hasDates = result.columns.some(
    (column) => column.logicalType === 'date' || column.logicalType === 'timestamp',
  )
  // A layout for other columns (the result changed) falls back to the result's own.
  const current = useMemo(() => layoutFor(layout, original), [layout, original])
  const visible = useMemo(() => visibleColumns(current), [current])

  const loadValues = useCallback(
    async (column: string, signal: AbortSignal) =>
      columnValues(await getDb(), result.relation, column, signal),
    [result],
  )
  const filterFor = useCallback(
    (meta: ColumnMeta) => (
      <ColumnFilterPopover
        meta={meta}
        filter={filters.find((filter) => filter.column === meta.name)}
        onChange={(filter) =>
          setFilters(
            filter ? setFilter(filters, filter) : filters.filter((f) => f.column !== meta.name),
          )
        }
        loadValues={loadValues}
      />
    ),
    [filters, loadValues],
  )

  const copy = ({ firstRow, lastRow, columns }: CopyRequest) => {
    const count = lastRow - firstRow + 1
    if (count > TSV_MAX_ROWS) {
      setStatus(`Select at most ${formatNumber(TSV_MAX_ROWS, locale)} rows to copy`)
      return
    }
    const indexes = columns.map((name) => result.columns.findIndex((c) => c.name === name))
    getDb()
      .then((engine) =>
        fetchPage(engine, result, { offset: firstRow, limit: count, sorting, filters }),
      )
      .then(async (rows) => {
        const cells = rows.map((row) => indexes.map((index) => row[index] ?? null))
        const single = cells.length === 1 && columns.length === 1
        await navigator.clipboard.writeText(
          single ? field(cells[0]?.[0] ?? null) : toTsv(columns, cells, { header: false }),
        )
        setStatus(
          single
            ? 'Copied 1 cell'
            : `Copied ${formatNumber(count, locale)} ${count === 1 ? 'row' : 'rows'} × ${columns.length} ${columns.length === 1 ? 'column' : 'columns'}`,
        )
      })
      .catch((error: unknown) => setStatus(toAppError(error).message))
  }

  const footer = (rowCount: number | null) => (
    <div className="flex h-8 shrink-0 items-center gap-2 border-t px-2 text-xs text-muted-foreground">
      <span className="shrink-0 tabular-nums">
        {filters.length > 0 && rowCount !== null
          ? `${formatNumber(rowCount, locale)} of ${formatNumber(result.rowCount, locale)} rows`
          : `${formatNumber(result.rowCount, locale)} ${result.rowCount === 1 ? 'row' : 'rows'}`}{' '}
        · {visible.length < original.length ? `${visible.length} of ` : ''}
        {original.length} columns
      </span>
      {sorting.length > 0 && (
        <Button size="xs" variant="ghost" onClick={() => setSorting([])}>
          Clear sort
        </Button>
      )}
      <span aria-live="polite" className="min-w-0 flex-1 truncate text-right">
        {status}
      </span>
      {hasDates && (
        <Button
          size="xs"
          variant="ghost"
          aria-label={dates === 'iso' ? 'Show dates in your locale' : 'Show dates as ISO'}
          onClick={() => setDates(dates === 'iso' ? 'locale' : 'iso')}
        >
          {dates === 'iso' ? 'ISO dates' : 'Local dates'}
        </Button>
      )}
      <ColumnsMenu layout={current} original={original} onChange={setLayout} />
      <ExportMenu
        result={result}
        sorting={sorting}
        filters={filters}
        rowCount={rowCount ?? result.rowCount}
        fileStem={exportName}
        onStatus={setStatus}
      />
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {filters.length > 0 && (
        <ul
          aria-label="Active filters"
          className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1 text-xs"
        >
          {filters.map((filter) => (
            <li
              key={filter.column}
              className="flex items-center gap-0.5 rounded-full border bg-muted/60 py-0.5 pr-0.5 pl-2"
            >
              <span className="max-w-64 truncate">{filterLabel(filter, locale)}</span>
              <button
                type="button"
                aria-label={`Remove filter: ${filterLabel(filter, locale)}`}
                className="rounded-full p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => setFilters(filters.filter((f) => f.column !== filter.column))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
          <li>
            <Button size="xs" variant="ghost" onClick={() => setFilters([])}>
              Clear filters
            </Button>
          </li>
        </ul>
      )}
      <GridBody
        key={attempt}
        result={result}
        label={label}
        profiles={profiles}
        sorting={sorting}
        onSortingChange={setSorting}
        filters={filters}
        visible={visible}
        filterFor={filterFor}
        onCopy={copy}
        onRetry={() => setAttempt((n) => n + 1)}
        footer={footer}
      />
    </div>
  )
}
