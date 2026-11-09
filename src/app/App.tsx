import { lazy, Suspense, useEffect } from 'react'
import { Route, Router, Switch, useLocation } from 'wouter'
import { MessagePage } from '@/app/MessagePage'
import { NewProjectRoute } from '@/app/NewProjectRoute'
import { PanelErrorBoundary } from '@/app/PanelErrorBoundary'
import { APP_BASE, legacyHashPath } from '@/app/paths'
import { ProjectRoute } from '@/app/ProjectRoute'
import { RequireAccount } from '@/app/RequireAccount'
import { isTryProject } from '@/app/tryDemo'
import { TryRoute } from '@/app/TryRoute'
import { TooltipProvider } from '@/components/ui/tooltip'
import { warmUpEngine } from '@/engine/duckdb'
import { HomePage } from '@/features/home/HomePage'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { applyTheme } from '@/lib/theme'
import { useAuthStore } from '@/stores/auth'
import { useFeedbackStore } from '@/stores/feedback'
import { startPlans } from '@/stores/plan'
import { startFilePersistence } from '@/stores/persistFiles'
import { useProjectsStore } from '@/stores/projects'
import { startRelationshipDetection } from '@/stores/relationships'
import { startSync } from '@/stores/sync'
import { useSettingsStore } from '@/stores/settings'

const BenchPage = lazy(() =>
  import('@/features/bench/BenchPage').then((module) => ({ default: module.BenchPage })),
)

// The account pages carry the landing's hero film and its motion library: a chunk of their own.
const LoginPage = lazy(() =>
  import('@/features/account/LoginPage').then((module) => ({ default: module.LoginPage })),
)
const RegisterPage = lazy(() =>
  import('@/features/account/RegisterPage').then((module) => ({ default: module.RegisterPage })),
)
const ForgotPage = lazy(() =>
  import('@/features/account/ForgotPage').then((module) => ({ default: module.ForgotPage })),
)
const ResetPage = lazy(() =>
  import('@/features/account/ResetPage').then((module) => ({ default: module.ResetPage })),
)
const AuthCallbackPage = lazy(() =>
  import('@/features/account/AuthCallbackPage').then((module) => ({
    default: module.AuthCallbackPage,
  })),
)
const AccountPage = lazy(() =>
  import('@/features/account/AccountPage').then((module) => ({ default: module.AccountPage })),
)
// Plan and billing (F-PLAN-04) and connecting OpenRouter (F-AI-07): small pages of their own.
const BillingPage = lazy(() =>
  import('@/features/plan/BillingPage').then((module) => ({ default: module.BillingPage })),
)
const ConnectOpenRouterPage = lazy(() =>
  import('@/features/settings/ConnectOpenRouterPage').then((module) => ({
    default: module.ConnectOpenRouterPage,
  })),
)

// Shared dashboards (F-SHARE-04/05): their own chunk; the account service loads when one opens.
const SharedDashboardPage = lazy(() =>
  import('@/features/sharing/SharedDashboardPage').then((module) => ({
    default: module.SharedDashboardPage,
  })),
)

/** While an account page's chunk loads: the paper, so it doesn't flash white. */
const paper = <div className="paper-scope min-h-dvh" />

// Routes under /app/ (F-HOME-01, D105): Home, a project's workspace, SQL and dashboard, the try
// link, the benchmark, the account pages (F-ACCT, M13) and shared dashboards (F-SHARE, M14). A
// project's own data loads when it opens (stores/projectSession.ts); settings and eval cases are
// global. Accounts are optional: guests never load the account service (F-SEC-09), except to open
// a view-only link someone gave them; a guest who turns on HushGlance AI (D125) calls only the
// model list and the `ai` function, without supabase-js.

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
    // Restores a saved session; guests and the demo load nothing for it.
    useAuthStore.getState().start()
    // HushGlance AI's models and what's left of the questions (F-PLAN-01): signed in, or a guest
    // who turned it on (D125); other guests load nothing.
    startPlans()
    // Signed in: the encrypted workspace on every device (M17); guests load nothing for it.
    startSync()
    startRelationshipDetection()
  }, [])

  return (
    <TooltipProvider>
      {/* Last resort: panels have their own boundaries, this catches the shell itself. */}
      <PanelErrorBoundary name="HushGlance">
        <Router base={APP_BASE}>
          <LegacyHashRedirect />
          <Switch>
            {/* Guests use Home and projects on this device (D125); see RequireAccount. */}
            <Route path="/">
              <RequireAccount openToGuests>
                <HomePage />
              </RequireAccount>
            </Route>
            <Route path="/new">
              <RequireAccount openToGuests>
                <NewProjectRoute />
              </RequireAccount>
            </Route>
            <Route path="/try" component={TryRoute} />
            <Route path="/bench">
              <PanelErrorBoundary name="the benchmark">
                <Suspense fallback={null}>
                  <BenchPage />
                </Suspense>
              </PanelErrorBoundary>
            </Route>
            {/* The try projects are always open; others too, unless the build asks for sign-in. */}
            <Route path="/p/:id/:view?">
              {(params) =>
                isTryProject(params.id) ? (
                  <ProjectRoute />
                ) : (
                  <RequireAccount openToGuests>
                    <ProjectRoute />
                  </RequireAccount>
                )
              }
            </Route>
            <Route path="/login">
              <Suspense fallback={paper}>
                <LoginPage />
              </Suspense>
            </Route>
            <Route path="/register">
              <Suspense fallback={paper}>
                <RegisterPage />
              </Suspense>
            </Route>
            <Route path="/forgot">
              <Suspense fallback={paper}>
                <ForgotPage />
              </Suspense>
            </Route>
            <Route path="/reset">
              <Suspense fallback={paper}>
                <ResetPage />
              </Suspense>
            </Route>
            <Route path="/auth/callback">
              <Suspense fallback={paper}>
                <AuthCallbackPage />
              </Suspense>
            </Route>
            <Route path="/account">
              <Suspense fallback={paper}>
                <AccountPage />
              </Suspense>
            </Route>
            <Route path="/account/billing">
              <Suspense fallback={null}>
                <BillingPage />
              </Suspense>
            </Route>
            <Route path="/connect/openrouter">
              <Suspense fallback={null}>
                <ConnectOpenRouterPage />
              </Suspense>
            </Route>
            {/* A view-only link needs no account (F-SHARE-04). */}
            <Route path="/s/:slug">
              {(params) => (
                <PanelErrorBoundary name="the shared dashboard">
                  <Suspense fallback={null}>
                    <SharedDashboardPage
                      key={params.slug}
                      source={{ kind: 'link', slug: params.slug }}
                    />
                  </Suspense>
                </PanelErrorBoundary>
              )}
            </Route>
            <Route path="/shared/:id">
              {(params) => (
                <RequireAccount>
                  <PanelErrorBoundary name="the shared dashboard">
                    <Suspense fallback={null}>
                      <SharedDashboardPage
                        key={params.id}
                        source={{ kind: 'member', id: params.id }}
                      />
                    </Suspense>
                  </PanelErrorBoundary>
                </RequireAccount>
              )}
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
