import { Table2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { getDb } from '@/engine/duckdb'
import { quoteIdent } from '@/engine/naming'
import { runQuery } from '@/engine/query'
import type { CellValue, ColumnMeta, QueryResult } from '@/engine/types'
import { isCancellation, toAppError, type AppError } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDatasetsStore } from '@/stores/datasets'
import { useSettingsStore } from '@/stores/settings'

// First rows of a table in the side panel. M2 replaces this with the virtualized grid (F-GRID-01).

const PREVIEW_ROWS = 100

function Cell({ value, column, locale }: { value: CellValue; column: ColumnMeta; locale: string }) {
  if (value === null) return <span className="text-muted-foreground italic">null</span>
  if (typeof value === 'number') {
    const digits = column.logicalType === 'integer' ? 0 : 4
    return <>{formatNumber(value, locale, { maxFractionDigits: digits })}</>
  }
  return <>{String(value)}</>
}

export function TablePreview({ table }: { table: string }) {
  const locale = useSettingsStore((state) => state.locale)
  // Re-query when the dataset is reloaded (sample regenerated, engine restarted).
  const version = useDatasetsStore(
    (state) => state.datasets.find((d) => d.table === table)?.createdAt,
  )
  const request = `${table}@${version ?? ''}`
  // Keyed by request, so a result for a previous table/version is never shown.
  const [loaded, setLoaded] = useState<{
    request: string
    result: QueryResult | null
    error: AppError | null
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getDb()
      .then((engine) =>
        runQuery(engine, `SELECT * FROM ${quoteIdent(table)}`, {
          maxRows: PREVIEW_ROWS,
          signal: controller.signal,
        }),
      )
      .then((result) => setLoaded({ request, result, error: null }))
      .catch((caught: unknown) => {
        if (!isCancellation(caught)) {
          setLoaded({ request, result: null, error: toAppError(caught) })
        }
      })
    return () => controller.abort()
  }, [request, table])

  const current = loaded?.request === request ? loaded : null
  if (current?.error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Couldn't load the preview"
        description={current.error.message}
      />
    )
  }
  const result = current?.result
  if (!result) {
    return (
      <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading preview">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    )
  }
  if (result.columns.length === 0) {
    return <EmptyState icon={Table2} title="This table has no columns" />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{table}</span> · first{' '}
        {formatNumber(result.rows.length, locale)} of {formatNumber(result.rowCount, locale)} rows
      </p>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column.name}
                  scope="col"
                  className={cn(
                    'border-b px-2 py-1.5 text-left font-mono font-medium whitespace-nowrap',
                    (column.logicalType === 'integer' || column.logicalType === 'number') &&
                      'text-right',
                  )}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-muted/50">
                {result.columns.map((column, columnIndex) => (
                  <td
                    key={column.name}
                    className={cn(
                      'max-w-60 truncate border-b border-border/50 px-2 py-1 whitespace-nowrap',
                      (column.logicalType === 'integer' || column.logicalType === 'number') &&
                        'text-right tabular-nums',
                    )}
                  >
                    <Cell value={row[columnIndex] ?? null} column={column} locale={locale} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
