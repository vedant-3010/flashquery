import { CircleAlert, GripVertical, LoaderCircle, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DashboardTile } from '@/dashboard/schema'
import { TileBody } from '@/features/dashboard/TileBody'
import { TileMenu } from '@/features/dashboard/TileMenu'
import { formatEventTime } from '@/lib/format'
import { useDashboardStore } from '@/stores/dashboard'
import { refreshTile } from '@/stores/dashboardJobs'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'

/** One dashboard tile: drag handle, title, status, the content, and how fresh it is. */
export function TileCard({
  tile,
  onEdit,
  focused = false,
}: {
  tile: DashboardTile
  onEdit: () => void
  /** Just pinned: highlighted for a moment. */
  focused?: boolean
}) {
  const status = useDashboardStore((state) => state.status[tile.id])
  const locale = useSettingsStore((state) => state.locale)
  const state = status?.state ?? 'snapshot'
  const at = tile.snapshot?.at

  return (
    <section
      aria-label={tile.title}
      data-tile-id={tile.id}
      tabIndex={-1}
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-xl border bg-card transition-shadow duration-500 outline-none',
        focused && 'ring-2 ring-primary/60',
      )}
    >
      <header className="flex items-center gap-1 px-2 pt-1.5">
        <span
          className="tile-handle -ml-0.5 flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
          title="Drag to move"
          aria-hidden
        >
          <GripVertical className="size-4" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={tile.title}>
          {tile.title}
        </h3>
        {tile.edited && <Badge variant="outline">Edited</Badge>}
        {tile.snapshot?.filtered && <Badge variant="secondary">Filtered</Badge>}
        {state === 'refreshing' && (
          <LoaderCircle
            className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-label="Refreshing"
          />
        )}
        <TileMenu tile={tile} onEdit={onEdit} />
      </header>
      {(state === 'stale' || state === 'error') && status?.message && (
        <p
          role={state === 'error' ? 'alert' : undefined}
          className="mx-2 mt-1 flex items-start gap-1 rounded bg-muted px-2 py-1 text-xs"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{status.message}</span>
          {state === 'error' && (
            <Button
              size="xs"
              variant="ghost"
              className="h-auto p-0"
              onClick={() => void refreshTile(tile.id)}
            >
              <RefreshCw aria-hidden />
              Retry
            </Button>
          )}
        </p>
      )}
      <div className="min-h-0 flex-1 px-2 pt-1 pb-0.5">
        <TileBody tile={tile} />
      </div>
      {tile.type !== 'text' && at && (
        <p className="shrink-0 px-2 pb-1 text-[11px] text-muted-foreground">
          {state === 'live' ? 'Updated' : 'Snapshot from'} {formatEventTime(at, locale)}
        </p>
      )}
    </section>
  )
}
