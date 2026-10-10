import {
  Download,
  Ellipsis,
  FileCode2,
  Palette,
  Presentation,
  Printer,
  RefreshCw,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react'
import { useRef } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChartPaletteSchema } from '@/charts/spec'
import { PALETTES } from '@/charts/theme'
import type { Dashboard } from '@/dashboard/schema'
import { DashboardSwitcher } from '@/features/dashboard/DashboardSwitcher'
import { printDashboardHtml, renderDashboardHtml } from '@/features/dashboard/exportDashboard'
import { ShareButton } from '@/features/sharing/ShareButton'
import { downloadBytes } from '@/lib/download'
import { toAppError } from '@/lib/errors'
import { useDashboardStore } from '@/stores/dashboard'
import { addTextTile, exportDashboard, importDashboard, refreshAll } from '@/stores/dashboardJobs'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

/**
 * Switcher and dashboard actions: generate, add text, refresh all, present, share, export and
 * import.
 */
export function DashboardToolbar({
  dashboard,
  onGenerate,
  onPresent,
}: {
  dashboard: Dashboard | null
  onGenerate: () => void
  /** Presentation mode (F-DASH-13). */
  onPresent: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const refreshing = useDashboardStore((state) =>
    (dashboard?.tiles ?? []).some((t) => state.status[t.id]?.state === 'refreshing'),
  )
  const toast = useToastStore((state) => state.show)
  const locale = useSettingsStore((state) => state.locale)
  const defaultPalette = useSettingsStore((state) => state.chartPalette)
  const setPalette = useDashboardStore((state) => state.setPalette)

  /** Standalone HTML with the tiles' snapshots (F-DASH-12); printing it gives a PDF. */
  const exportHtml = (print: boolean) => {
    if (!dashboard) return
    renderDashboardHtml(dashboard, locale, dashboard.palette ?? defaultPalette)
      .then(({ fileName, html }) => {
        if (print) {
          if (!printDashboardHtml(html))
            toast('Allow pop-ups for this site to print the dashboard.')
          return
        }
        downloadBytes(new TextEncoder().encode(html), fileName, 'text/html')
        toast(`Exported ${fileName}.`)
      })
      .catch((error: unknown) => toast(`Couldn't export: ${toAppError(error).message}`))
  }

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
        {dashboard && dashboard.tiles.length > 0 && (
          <Button size="sm" variant="outline" onClick={onPresent}>
            <Presentation aria-hidden />
            Present
          </Button>
        )}
        {dashboard && (dashboard.tiles.length > 0 || dashboard.cloud) && (
          <ShareButton dashboard={dashboard} />
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
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem disabled={!dashboard} onSelect={() => download(true)}>
              <Download aria-hidden />
              Export JSON (with data snapshots)
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!dashboard} onSelect={() => download(false)}>
              <Download aria-hidden />
              Export JSON (layout and SQL only)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!dashboard || dashboard.tiles.length === 0}
              onSelect={() => exportHtml(false)}
            >
              <FileCode2 aria-hidden />
              Download as HTML (standalone)
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!dashboard || dashboard.tiles.length === 0}
              onSelect={() => exportHtml(true)}
            >
              <Printer aria-hidden />
              Print or save as PDF…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!dashboard}>
                <Palette aria-hidden />
                Chart colors
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={dashboard?.palette ?? 'default'}
                  onValueChange={(value) =>
                    dashboard &&
                    setPalette(
                      dashboard.id,
                      value === 'default' ? null : ChartPaletteSchema.parse(value),
                    )
                  }
                >
                  <DropdownMenuRadioItem value="default">
                    Default ({PALETTES[defaultPalette].label})
                  </DropdownMenuRadioItem>
                  {ChartPaletteSchema.options.map((palette) => (
                    <DropdownMenuRadioItem key={palette} value={palette}>
                      {PALETTES[palette].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
