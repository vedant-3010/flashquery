import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardTile } from '@/dashboard/schema'
import { Markdown } from '@/features/dashboard/Markdown'
import { SnapshotTable } from '@/features/dashboard/SnapshotTable'

const ChartView = lazy(() =>
  import('@/features/charts/ChartView').then((module) => ({ default: module.ChartView })),
)

/** What a tile shows: its chart, KPI, table (from the snapshot) or markdown. */
export function TileBody({
  tile,
  onSelect,
}: {
  tile: DashboardTile
  /** Clicking a bar or slice filters the dashboard (F-DASH-11); absent when it can't. */
  onSelect?: (value: string) => void
}) {
  if (tile.type === 'text') return <Markdown text={tile.text ?? ''} />
  const { snapshot } = tile
  if (!snapshot) {
    return <p className="text-sm text-muted-foreground">Not run yet. Refresh to load it.</p>
  }
  if (tile.type === 'table' || !tile.chartSpec || tile.chartSpec.type === 'table') {
    return <SnapshotTable snapshot={snapshot} />
  }
  return (
    <Suspense fallback={<Skeleton className="h-full w-full" />}>
      <ChartView
        spec={tile.chartSpec}
        data={{
          columns: snapshot.columns,
          rows: snapshot.rows,
          rowCount: snapshot.rowCount,
          sampling: snapshot.sampling,
        }}
        compact
        onSelect={onSelect}
        className="h-full w-full"
      />
    </Suspense>
  )
}
