import {
  ArrowDown,
  ArrowUp,
  Copy,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Scaling,
  Trash2,
} from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { DashboardTile } from '@/dashboard/schema'
import { useDashboardStore } from '@/stores/dashboard'
import { refreshTile } from '@/stores/dashboardJobs'

/** Tile actions; Size and Move are the keyboard alternative to dragging (F-DASH-02). */
export function TileMenu({ tile, onEdit }: { tile: DashboardTile; onEdit: () => void }) {
  const { duplicateTile, removeTile, resizeTile, moveTile } = useDashboardStore()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Actions for ${tile.title}`} size="icon-xs">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {tile.type !== 'text' && (
          <DropdownMenuItem onSelect={() => void refreshTile(tile.id)}>
            <RefreshCw aria-hidden />
            Refresh
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil aria-hidden />
          Edit…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => duplicateTile(tile.id)}>
          <Copy aria-hidden />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Scaling aria-hidden />
            Size
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => resizeTile(tile.id, 'small')}>Small</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => resizeTile(tile.id, 'medium')}>
              Medium
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => resizeTile(tile.id, 'large')}>
              Full width
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => moveTile(tile.id, 'earlier')}>
          <ArrowUp aria-hidden />
          Move earlier
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => moveTile(tile.id, 'later')}>
          <ArrowDown aria-hidden />
          Move later
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => removeTile(tile.id)}>
          <Trash2 aria-hidden />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
