import { SquareTerminal, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getDb } from '@/engine/duckdb'
import { openTable, type PagedResult } from '@/engine/paging'
import type { ColumnProfile } from '@/engine/types'
import { ResultGrid } from '@/features/grid/ResultGrid'
import { isCancellation, toAppError, type AppError } from '@/lib/errors'
import { useDatasetsStore } from '@/stores/datasets'
import { useSqlStore } from '@/stores/sql'

/** A whole table in the grid (side panel preview). */
export function TableGrid({ table }: { table: string }) {
  const dataset = useDatasetsStore((state) => state.datasets.find((d) => d.table === table))
  const openInEditor = useSqlStore((state) => state.openTable)
  // Reopen when the dataset is reloaded (sample regenerated, engine restarted).
  const request = `${table}@${dataset?.createdAt ?? ''}`
  const [opened, setOpened] = useState<{
    request: string
    result: PagedResult | null
    error: AppError | null
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getDb()
      .then((engine) => openTable(engine, table, controller.signal))
      .then((result) => setOpened({ request, result, error: null }))
      .catch((caught: unknown) => {
        if (!isCancellation(caught)) setOpened({ request, result: null, error: toAppError(caught) })
      })
    return () => controller.abort()
  }, [request, table])

  const profiles = useMemo(
    () => new Map<string, ColumnProfile>(dataset?.columns.map((column) => [column.name, column])),
    [dataset],
  )
  const current = opened?.request === request ? opened : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{table}</span>
        <Button size="xs" variant="ghost" onClick={() => openInEditor(table)}>
          <SquareTerminal aria-hidden />
          Open in SQL
        </Button>
      </div>
      {current?.error ? (
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't open this table"
          description={current.error.message}
        />
      ) : current?.result ? (
        <ResultGrid
          key={request}
          result={current.result}
          label={`Rows of ${table}`}
          exportName={table}
          profiles={profiles}
        />
      ) : (
        <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading rows">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      )}
    </div>
  )
}
