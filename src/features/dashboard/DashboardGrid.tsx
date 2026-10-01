import 'react-grid-layout/css/styles.css'
import '@/features/dashboard/grid.css'
import { useEffect, useMemo } from 'react'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import type { Dashboard } from '@/dashboard/schema'
import { COLS } from '@/dashboard/layout'
import { TileCard } from '@/features/dashboard/TileCard'
import { useDashboardStore } from '@/stores/dashboard'
import { useUiStore } from '@/stores/ui'

const GRID = {
  cols: COLS,
  rowHeight: 72,
  margin: [12, 12] as const,
  containerPadding: [0, 0] as const,
}

/** The 12-column tile grid (F-DASH-02): drag by the handle, resize from the corner. */
export function DashboardGrid({
  dashboard,
  onEdit,
}: {
  dashboard: Dashboard
  onEdit: (tileId: string) => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const setLayouts = useDashboardStore((state) => state.setLayouts)
  const focus = useUiStore((state) => state.focusTile)
  const setFocusTile = useUiStore((state) => state.setFocusTile)

  // A tile that was just pinned: scroll to it, focus it, and highlight it briefly.
  useEffect(() => {
    if (!focus || !mounted) return
    const frame = requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-tile-id="${CSS.escape(focus.id)}"]`,
      )
      element?.scrollIntoView({ block: 'center' })
      element?.focus({ preventScroll: true })
    })
    const timer = window.setTimeout(() => setFocusTile(null), 1600)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [focus, mounted, setFocusTile])
  const layout = useMemo<Layout>(
    () => dashboard.tiles.map((tile) => ({ i: tile.id, ...tile.layout, minW: 2, minH: 2 })),
    [dashboard.tiles],
  )

  return (
    <div ref={containerRef}>
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={GRID}
          dragConfig={{ handle: '.tile-handle' }}
          resizeConfig={{ handles: ['se'] }}
          onLayoutChange={(next) =>
            setLayouts(
              dashboard.id,
              new Map(next.map((item) => [item.i, { x: item.x, y: item.y, w: item.w, h: item.h }])),
            )
          }
        >
          {dashboard.tiles.map((tile) => (
            <div key={tile.id}>
              <TileCard
                tile={tile}
                focused={tile.id === focus?.id}
                onEdit={() => onEdit(tile.id)}
              />
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  )
}
