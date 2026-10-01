import { lazy, Suspense, useEffect } from 'react'
import { PanelErrorBoundary } from '@/app/PanelErrorBoundary'
import { SidePanel } from '@/app/SidePanel'
import { TopBar } from '@/app/TopBar'
import { Toaster } from '@/components/Toaster'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { AskView } from '@/features/ask/AskView'
import { HowItWorksDialog } from '@/features/ask/HowItWorksDialog'
import { DatasetsPanel } from '@/features/datasets/DatasetsPanel'
import { FileDropZone } from '@/features/datasets/FileDropZone'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { SqlView } from '@/features/sql/SqlView'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useUiStore, ViewSchema } from '@/stores/ui'

// The dashboard (react-grid-layout, its tiles and dialogs) loads on first visit.
const DashboardView = lazy(() =>
  import('@/features/dashboard/DashboardView').then((module) => ({
    default: module.DashboardView,
  })),
)

/** At and above this width the sidebar is docked; below it collapses into an overlay (F-SHELL-01). */
const WIDE_LAYOUT_QUERY = '(min-width: 1280px)'

export function AppShell() {
  const view = useUiStore((state) => state.view)
  const setView = useUiStore((state) => state.setView)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)
  const sidePanelOpen = useUiStore((state) => state.sidePanelOpen)
  const highlight = useUiStore((state) => state.highlight)
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY)

  // Don't reopen a stale overlay after the window was widened and narrowed again.
  useEffect(() => {
    if (wide) setSidebarOpen(false)
  }, [wide, setSidebarOpen])

  // A highlighted column must be visible: open the overlay sidebar when it isn't docked.
  useEffect(() => {
    if (highlight && !wide) setSidebarOpen(true)
  }, [highlight, wide, setSidebarOpen])

  const datasetsPanel = (onClose?: () => void) => (
    <PanelErrorBoundary name="the datasets panel">
      <DatasetsPanel onClose={onClose} />
    </PanelErrorBoundary>
  )

  return (
    <Tabs
      value={view}
      onValueChange={(value) => setView(ViewSchema.parse(value))}
      className="h-dvh gap-0 overflow-hidden"
    >
      <TopBar showSidebarToggle={!wide} />
      <div className="flex min-h-0 flex-1">
        {wide ? (
          <aside aria-label="Datasets" className="flex w-65 shrink-0 flex-col border-r bg-sidebar">
            {datasetsPanel()}
          </aside>
        ) : (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="gap-0 bg-sidebar p-0 data-[side=left]:w-72"
              aria-describedby={undefined}
              showCloseButton={false}
            >
              <SheetTitle className="sr-only">Datasets</SheetTitle>
              {datasetsPanel(() => setSidebarOpen(false))}
            </SheetContent>
          </Sheet>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <TabsContent value="workspace" className="flex min-h-0 flex-col">
            <PanelErrorBoundary name="the workspace">
              <AskView />
            </PanelErrorBoundary>
          </TabsContent>
          <TabsContent value="sql" className="flex min-h-0 flex-col">
            <PanelErrorBoundary name="the SQL editor">
              <SqlView />
            </PanelErrorBoundary>
          </TabsContent>
          <TabsContent value="dashboard" className="flex min-h-0 flex-col">
            <PanelErrorBoundary name="the dashboard">
              <Suspense fallback={<Skeleton className="m-4 h-40" />}>
                <DashboardView />
              </Suspense>
            </PanelErrorBoundary>
          </TabsContent>
        </main>
        {sidePanelOpen && (
          <aside aria-label="Side panel" className="flex w-90 shrink-0 flex-col border-l">
            <PanelErrorBoundary name="the side panel">
              <SidePanel />
            </PanelErrorBoundary>
          </aside>
        )}
      </div>
      <FileDropZone />
      <SettingsDialog />
      <Toaster />
      <HowItWorksDialog />
    </Tabs>
  )
}
