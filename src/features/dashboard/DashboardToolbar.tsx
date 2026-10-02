import { Download, Ellipsis, RefreshCw, Sparkles, Type, Upload } from 'lucide-react'
import { useRef } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Dashboard } from '@/dashboard/schema'
import { DashboardSwitcher } from '@/features/dashboard/DashboardSwitcher'
import { downloadBytes } from '@/lib/download'
import { toAppError } from '@/lib/errors'
import { useDashboardStore } from '@/stores/dashboard'
import { addTextTile, exportDashboard, importDashboard, refreshAll } from '@/stores/dashboardJobs'
import { useToastStore } from '@/stores/toast'

/** Switcher and dashboard actions: generate, add text, refresh all, export and import. */
export function DashboardToolbar({
  dashboard,
  onGenerate,
}: {
  dashboard: Dashboard | null
  onGenerate: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const refreshing = useDashboardStore((state) =>
    (dashboard?.tiles ?? []).some((t) => state.status[t.id]?.state === 'refreshing'),
  )
  const toast = useToastStore((state) => state.show)

  const download = (snapshots: boolean) => {
    if (!dashboard) return
    const file = exportDashboard(dashboard.id, { snapshots })
    if (!file) return
    downloadBytes(new TextEncoder().encode(file.json), file.fileName, 'application/json')
    toast(`Exported ${file.fileName}.`)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {dashboard && <DashboardSwitcher dashboard={dashboard} />}
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" onClick={onGenerate}>
          <Sparkles aria-hidden />
          Generate dashboard
        </Button>
        <Button size="sm" variant="outline" onClick={() => addTextTile()}>
          <Type aria-hidden />
          Add text
        </Button>
        {dashboard && dashboard.tiles.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refreshAll(dashboard.id)}
          >
            <RefreshCw
              className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''}
              aria-hidden
            />
            Refresh all
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="hidden"
          data-testid="dashboard-import"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            file
              .text()
              .then((text) => {
                importDashboard(text)
                toast(`Imported ${file.name}.`)
              })
              .catch((error: unknown) => toast(`Couldn't import: ${toAppError(error).message}`))
          }}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More dashboard actions">
              <Ellipsis />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!dashboard} onSelect={() => download(true)}>
              <Download aria-hidden />
              Export JSON (with data snapshots)
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!dashboard} onSelect={() => download(false)}>
              <Download aria-hidden />
              Export JSON (layout and SQL only)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => input.current?.click()}>
              <Upload aria-hidden />
              Import JSON…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
