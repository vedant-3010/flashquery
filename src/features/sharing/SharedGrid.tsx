import 'react-grid-layout/css/styles.css'
import '@/features/dashboard/grid.css'
import { ArrowDown, ArrowUp, GripVertical, MoreHorizontal, Pencil, Scaling } from 'lucide-react'
import { useMemo } from 'react'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  COLS,
  GRID_CONFIG,
  moveTile,
  sizePreset,
  STACK_BELOW_PX,
  type SizePreset,
} from '@/dashboard/layout'
import type { Dashboard, DashboardTile, TileLayout } from '@/dashboard/schema'
import { StackedTiles } from '@/features/dashboard/StackedTiles'
import { TileBody } from '@/features/dashboard/TileBody'
import { formatEventTime } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

/**
 * A shared dashboard's tiles (F-SHARE-05/06), from their snapshots alone: no data, no engine, no
 * key. Editors arrange them (drag and resize, or Size and Move in the tile's menu, the keyboard way)
 * and open a tile to change its title or text.
 */
export function SharedGrid({
  dashboard,
  editing,
  onLayout,
  onEditTile,
}: {
  dashboard: Dashboard
  editing: boolean
  onLayout: (layouts: ReadonlyMap<string, TileLayout>) => void
  onEditTile: (tileId: string) => void
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const locale = useSettingsStore((state) => state.locale)
  const layout = useMemo<Layout>(
    () => dashboard.tiles.map((tile) => ({ i: tile.id, ...tile.layout, minW: 2, minH: 2 })),
    [dashboard.tiles],
  )
  const stacked = mounted && !editing && width < STACK_BELOW_PX

  const layouts = () => new Map(dashboard.tiles.map((t) => [t.id, t.layout]))
  const resize = (tile: DashboardTile, preset: SizePreset) => {
    const size = sizePreset(tile.type, preset)
    onLayout(
      layouts().set(tile.id, {
        ...tile.layout,
        ...size,
        x: Math.min(tile.layout.x, COLS - size.w),
      }),
    )
  }

  const card = (tile: DashboardTile) => (
    <section
      aria-label={tile.title}
      data-tile-id={tile.id}
      className="flex h-full flex-col overflow-hidden rounded-xl border bg-card"
    >
      <header className="flex items-center gap-1 px-2 pt-1.5">
        {editing && (
          <span
            className="tile-handle -ml-0.5 flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
            title="Drag to move"
            aria-hidden
          >
            <GripVertical className="size-4" />
          </span>
        )}
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={tile.title}>
          {tile.title}
        </h3>
        {editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={`Actions for ${tile.title}`} size="icon-xs">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              <DropdownMenuItem onSelect={() => onEditTile(tile.id)}>
                <Pencil aria-hidden />
                Edit…
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Scaling aria-hidden />
                  Size
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => resize(tile, 'small')}>Small</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => resize(tile, 'medium')}>
                    Medium
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => resize(tile, 'large')}>
                    Full width
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => onLayout(moveTile(layouts(), tile.id, 'earlier'))}>
                <ArrowUp aria-hidden />
                Move earlier
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onLayout(moveTile(layouts(), tile.id, 'later'))}>
                <ArrowDown aria-hidden />
                Move later
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="min-h-0 flex-1 px-2 pt-1 pb-0.5">
        <TileBody tile={tile} />
      </div>
      {tile.type !== 'text' && tile.snapshot && (
        <p className="shrink-0 px-2 pb-1 text-[11px] text-muted-foreground">
          Results from {formatEventTime(tile.snapshot.at, locale)}
        </p>
      )}
    </section>
  )

  return (
    <div ref={containerRef}>
      {stacked && <StackedTiles tiles={dashboard.tiles}>{card}</StackedTiles>}
      {mounted && !stacked && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={GRID_CONFIG}
          dragConfig={{ enabled: editing, handle: '.tile-handle' }}
          resizeConfig={{ enabled: editing, handles: ['se'] }}
          onLayoutChange={(next) => {
            if (!editing) return
            onLayout(
              new Map(next.map((item) => [item.i, { x: item.x, y: item.y, w: item.w, h: item.h }])),
            )
          }}
        >
          {dashboard.tiles.map((tile) => (
            <div key={tile.id}>{card(tile)}</div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  )
}
