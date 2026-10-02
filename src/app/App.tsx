import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { AppShell } from '@/app/AppShell'
import { PanelErrorBoundary } from '@/app/PanelErrorBoundary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { warmUpEngine } from '@/engine/duckdb'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { applyTheme } from '@/lib/theme'
import { useDashboardStore } from '@/stores/dashboard'
import { useHistoryStore } from '@/stores/history'
import { useFeedbackStore } from '@/stores/feedback'
import { useNotesStore } from '@/stores/notes'
import { useSuggestionsStore } from '@/stores/suggestions'
import { useSettingsStore } from '@/stores/settings'

const BenchPage = lazy(() =>
  import('@/features/bench/BenchPage').then((module) => ({ default: module.BenchPage })),
)

// No router: the hash only switches to the benchmark page (F-PERF-04).
const subscribeHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}
const readHash = () => window.location.hash

export function App() {
  const hash = useSyncExternalStore(subscribeHash, readHash)
  const theme = useResolvedTheme()
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => warmUpEngine(), [])
  useEffect(() => {
    void useSettingsStore.getState().hydrate()
    void useHistoryStore.getState().hydrate()
    void useDashboardStore.getState().hydrate()
    void useNotesStore.getState().hydrate()
    void useFeedbackStore.getState().hydrate()
    void useSuggestionsStore.getState().hydrate()
  }, [])

  if (hash === '#/bench') {
    return (
      <TooltipProvider>
        <PanelErrorBoundary name="the benchmark">
          <Suspense fallback={null}>
            <BenchPage />
          </Suspense>
        </PanelErrorBoundary>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      {/* Last resort: panels have their own boundaries, this catches the shell itself. */}
      <PanelErrorBoundary name="AskData">
        <AppShell />
      </PanelErrorBoundary>
    </TooltipProvider>
  )
}
