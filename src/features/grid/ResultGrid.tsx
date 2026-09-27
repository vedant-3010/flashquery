import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import type { PagedResult, SortSpec } from '@/engine/paging'
import type { ColumnProfile } from '@/engine/types'
import { DataGrid } from '@/features/grid/DataGrid'
import { ExportMenu } from '@/features/grid/ExportMenu'
import { useGridRows } from '@/features/grid/useGridRows'
import { formatNumber } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

interface ResultGridProps {
  result: PagedResult
  label: string
  /** File name (without extension) for exports. */
  exportName: string
  profiles?: ReadonlyMap<string, ColumnProfile>
}

interface GridBodyProps extends Omit<ResultGridProps, 'exportName'> {
  sorting: SortSpec[]
  onSortingChange: (sorting: SortSpec[]) => void
  onRetry: () => void
}

function GridBody({ result, sorting, onRetry, ...props }: GridBodyProps) {
  const { rows, error } = useGridRows(result, sorting)
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
        rowCount={result.rowCount}
        rows={rows}
        sorting={sorting}
      />
      {result.rowCount === 0 && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">No rows.</p>
      )}
    </>
  )
}

/** A paged result in the virtual grid, with sorting, a status line and export (M2). */
export function ResultGrid({ result, label, exportName, profiles }: ResultGridProps) {
  const locale = useSettingsStore((state) => state.locale)
  const dates = useSettingsStore((state) => state.dateDisplay)
  const setDates = useSettingsStore((state) => state.setDateDisplay)
  const [sorting, setSorting] = useState<SortSpec[]>([])
  // A new key remounts the body with an empty page cache.
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('')
  const hasDates = result.columns.some(
    (column) => column.logicalType === 'date' || column.logicalType === 'timestamp',
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GridBody
        key={attempt}
        result={result}
        label={label}
        profiles={profiles}
        sorting={sorting}
        onSortingChange={setSorting}
        onRetry={() => setAttempt((n) => n + 1)}
      />
      <div className="flex h-8 shrink-0 items-center gap-2 border-t px-2 text-xs text-muted-foreground">
        <span className="shrink-0 tabular-nums">
          {formatNumber(result.rowCount, locale)} {result.rowCount === 1 ? 'row' : 'rows'} ·{' '}
          {result.columns.length} columns
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
        <ExportMenu result={result} sorting={sorting} fileStem={exportName} onStatus={setStatus} />
      </div>
    </div>
  )
}
