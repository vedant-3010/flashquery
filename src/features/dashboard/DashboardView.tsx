import { LayoutDashboard, MessageSquareText, Minimize2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardGrid } from '@/features/dashboard/DashboardGrid'
import { DashboardToolbar } from '@/features/dashboard/DashboardToolbar'
import { EditTileSheet } from '@/features/dashboard/EditTileSheet'
import { FilterBar } from '@/features/dashboard/FilterBar'
import { GenerateDialog } from '@/features/dashboard/GenerateDialog'
import { usePresentation } from '@/features/dashboard/usePresentation'
import { useDashboardStore } from '@/stores/dashboard'
import { refreshWhenReady } from '@/stores/dashboardJobs'
import { useDatasetsStore } from '@/stores/datasets'
import { useUiStore } from '@/stores/ui'

/**
 * The dashboard (F-DASH-01…10). Tiles appear from their snapshots at once; those whose tables are
 * loaded (with the same columns) are refreshed, here and whenever datasets change.
 */
export function DashboardView() {
  const hydrated = useDashboardStore((state) => state.hydrated)
  const dashboards = useDashboardStore((state) => state.dashboards)
  const activeId = useDashboardStore((state) => state.activeId)
  const datasets = useDatasetsStore((state) => state.datasets)
  const setView = useUiStore((state) => state.setView)
  const [editing, setEditing] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const dashboard = dashboards.find((d) => d.id === activeId) ?? dashboards.at(-1) ?? null
  const dashboardId = dashboard?.id ?? null
  const tileIds = dashboard?.tiles.map((t) => t.id).join(',') ?? ''
  const root = useRef<HTMLDivElement>(null)
  const presentation = usePresentation(root)

  useEffect(() => {
    if (dashboardId) void refreshWhenReady(dashboardId)
  }, [dashboardId, datasets, tileIds])

  // One root element in both modes: it's the element that goes full screen.
  if (presentation.presenting && dashboard) {
    return (
      <div
        ref={root}
        role="region"
        aria-label={`Presenting ${dashboard.name}`}
        className="fixed inset-0 z-50 flex flex-col bg-background"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-6 py-3">
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{dashboard.name}</h1>
          <Button size="sm" variant="ghost" onClick={presentation.stop}>
            <Minimize2 aria-hidden />
            Exit presentation (Esc)
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <DashboardGrid dashboard={dashboard} onEdit={() => undefined} readOnly />
        </div>
      </div>
    )
  }

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 gap-2 border-b px-4 py-2">
        <DashboardToolbar
          dashboard={dashboard}
          onGenerate={() => setGenerating(true)}
          onPresent={presentation.start}
        />
        {dashboard && <FilterBar dashboard={dashboard} />}
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
        {!hydrated ? (
          <Skeleton className="h-40 w-full" />
        ) : !dashboard || dashboard.tiles.length === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title="No tiles yet"
            description="Pin answers from the workspace, or let the AI propose a dashboard for a dataset."
          >
            <Button size="sm" disabled={datasets.length === 0} onClick={() => setGenerating(true)}>
              <Sparkles aria-hidden />
              Generate dashboard
            </Button>
            <Button size="sm" variant="outline" onClick={() => setView('workspace')}>
              <MessageSquareText aria-hidden />
              Ask a question
            </Button>
          </EmptyState>
        ) : (
          <DashboardGrid dashboard={dashboard} onEdit={setEditing} />
        )}
      </div>
      <EditTileSheet tileId={editing} onClose={() => setEditing(null)} />
      <GenerateDialog open={generating} onOpenChange={setGenerating} />
    </div>
  )
}
