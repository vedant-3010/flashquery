import { useMemo, type ReactNode } from 'react'
import { stackRows, tileHeightPx } from '@/dashboard/layout'
import type { DashboardTile } from '@/dashboard/schema'

/**
 * A dashboard on a phone (D117): one tile per row in reading order, each as tall as on the grid,
 * with KPI tiles in pairs (a number needs half the width). Used by the dashboard, presentation
 * mode and shared dashboards.
 */
export function StackedTiles({
  tiles,
  children,
}: {
  tiles: DashboardTile[]
  children: (tile: DashboardTile) => ReactNode
}) {
  const ordered = useMemo(() => stackRows(tiles), [tiles])
  return (
    <div className="grid gap-3">
      {ordered.map((row) => (
        <div
          key={row.map((tile) => tile.id).join(' ')}
          className={row.length > 1 ? 'grid grid-cols-2 gap-3' : undefined}
          style={{ height: Math.max(...row.map((tile) => tileHeightPx(tile.layout))) }}
        >
          {row.map((tile) => (
            <div key={tile.id} className="h-full min-w-0">
              {children(tile)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
