import { lazy, Suspense, useEffect } from 'react'
import { Route, Router, Switch, useLocation } from 'wouter'
import { MessagePage } from '@/app/MessagePage'
import { NewProjectRoute } from '@/app/NewProjectRoute'
import { PanelErrorBoundary } from '@/app/PanelErrorBoundary'
import { APP_BASE, legacyHashPath } from '@/app/paths'
import { ProjectRoute } from '@/app/ProjectRoute'
import { TryRoute } from '@/app/TryRoute'
import { TooltipProvider } from '@/components/ui/tooltip'
import { warmUpEngine } from '@/engine/duckdb'
import { HomePage } from '@/features/home/HomePage'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { applyTheme } from '@/lib/theme'
import { useFeedbackStore } from '@/stores/feedback'
import { startFilePersistence } from '@/stores/persistFiles'
import { useProjectsStore } from '@/stores/projects'
import { startRelationshipDetection } from '@/stores/relationships'
import { useSettingsStore } from '@/stores/settings'

const BenchPage = lazy(() =>
  import('@/features/bench/BenchPage').then((module) => ({ default: module.BenchPage })),
)

// Routes under /app/ (F-HOME-01, D105): Home, a project's workspace, SQL and dashboard, the try
// link, the benchmark, and placeholders for accounts (M13) and shared links (M14). A project's own
// data loads when it opens (stores/projectSession.ts); settings and eval cases are global.

/** v1 links (`/app/#/bench`, `/app/#/try`) go to their routes. */
function LegacyHashRedirect() {
  const [, navigate] = useLocation()
  useEffect(() => {
    const target = legacyHashPath(window.location.hash)
    if (target) navigate(target, { replace: true })
  }, [navigate])
  return null
}

export function App() {
  const theme = useResolvedTheme()
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => warmUpEngine(), [])
  useEffect(() => {
    // Kept files (F-DATA-12) follow the setting from anywhere, Home included.
    void useSettingsStore
      .getState()
      .hydrate()
      .then(() => startFilePersistence())
    void useProjectsStore.getState().hydrate()
    void useFeedbackStore.getState().hydrate()
    startRelationshipDetection()
  }, [])

  return (
    <TooltipProvider>
      {/* Last resort: panels have their own boundaries, this catches the shell itself. */}
      <PanelErrorBoundary name="flashQuery">
        <Router base={APP_BASE}>
          <LegacyHashRedirect />
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/new" component={NewProjectRoute} />
            <Route path="/try" component={TryRoute} />
            <Route path="/bench">
              <PanelErrorBoundary name="the benchmark">
                <Suspense fallback={null}>
                  <BenchPage />
                </Suspense>
              </PanelErrorBoundary>
            </Route>
            <Route path="/p/:id/:view?" component={ProjectRoute} />
            <Route path="/login">
              <MessagePage
                title="Sign-in is coming"
                description="Accounts arrive with sharing. Everything works without one: your projects stay in this browser."
              />
            </Route>
            <Route path="/register">
              <MessagePage
                title="Sign-up is coming"
                description="Accounts arrive with sharing. Everything works without one: your projects stay in this browser."
              />
            </Route>
            <Route path="/s/:slug">
              <MessagePage
                title="Shared dashboards are coming"
                description="This link will open a dashboard someone shared with you. Sharing isn't available yet."
              />
            </Route>
            <Route>
              <MessagePage title="Page not found" description="There's nothing at this address." />
            </Route>
          </Switch>
        </Router>
      </PanelErrorBoundary>
    </TooltipProvider>
  )
}
