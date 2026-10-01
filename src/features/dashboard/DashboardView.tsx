import { LayoutDashboard, MessageSquareText, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardGrid } from '@/features/dashboard/DashboardGrid'
import { DashboardToolbar } from '@/features/dashboard/DashboardToolbar'
import { EditTileSheet } from '@/features/dashboard/EditTileSheet'
import { FilterBar } from '@/features/dashboard/FilterBar'
import { GenerateDialog } from '@/features/dashboard/GenerateDialog'
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

  useEffect(() => {
    if (dashboardId) void refreshWhenReady(dashboardId)
  }, [dashboardId, datasets, tileIds])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 gap-2 border-b px-4 py-2">
        <DashboardToolbar dashboard={dashboard} onGenerate={() => setGenerating(true)} />
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
