import { useEffect } from 'react'
import { AppShell } from '@/app/AppShell'
import { PanelErrorBoundary } from '@/app/PanelErrorBoundary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { warmUpEngine } from '@/engine/duckdb'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { applyTheme } from '@/lib/theme'
import { useDashboardStore } from '@/stores/dashboard'
import { useHistoryStore } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'

export function App() {
  const theme = useResolvedTheme()
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => warmUpEngine(), [])
  useEffect(() => {
    void useSettingsStore.getState().hydrate()
    void useHistoryStore.getState().hydrate()
    void useDashboardStore.getState().hydrate()
  }, [])

  return (
    <TooltipProvider>
      {/* Last resort: panels have their own boundaries, this catches the shell itself. */}
      <PanelErrorBoundary name="AskData">
        <AppShell />
      </PanelErrorBoundary>
    </TooltipProvider>
  )
}
