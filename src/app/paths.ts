import type { View } from '@/stores/ui'

// The app's routes (F-HOME-01, D105), relative to wouter's base `/app`. Pure.

export const APP_BASE = '/app'

export const paths = {
  home: '/',
  /** Creates a project and opens it. */
  newProject: '/new',
  /** "Try it on 1M rows" (F-HOME-04). */
  try: '/try',
  bench: '/bench',
  login: '/login',
  register: '/register',
  /** Asks for a password reset link. */
  forgot: '/forgot',
  /** Where a reset link lands: choose a new password. */
  reset: '/reset',
  /** Where email links and Google/GitHub sign-in come back to (PKCE ?code=). */
  authCallback: '/auth/callback',
  account: '/account',
  project: (id: string, view: View = 'workspace') =>
    view === 'workspace' ? `/p/${id}` : `/p/${id}/${view}`,
}

/** The URL the browser shows for a route: `/app/p/x`. */
export const appUrl = (path: string) => (path === '/' ? `${APP_BASE}/` : `${APP_BASE}${path}`)

/** A project's view from the path segment after its id (none: the workspace); null if unknown. */
export function viewFromSegment(segment: string | undefined): View | null {
  if (segment === undefined || segment === '') return 'workspace'
  return segment === 'sql' || segment === 'dashboard' ? segment : null
}

/** v1 links (`/app/#/bench`, `/app/#/try`) and where they go now. */
export function legacyHashPath(hash: string): string | null {
  if (hash === '#/bench') return paths.bench
  if (hash === '#/try' || hash.startsWith('#/try?')) return paths.try
  return null
}

/**
 * Where to go after signing in: `?next=` when it's a path in this app, else Home. Never another
 * site: "//host" and "/\\host" are rejected, and wouter keeps every path under /app/ anyway.
 */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get('next')
  const inApp = next !== null && /^\/(?![/\\])/.test(next)
  const isAuthPage = next !== null && /^\/(login|register|forgot|reset|auth\/)/.test(next)
  return inApp && !isAuthPage ? next : paths.home
}

/** The sign-in page, returning to `next` (an app path) afterwards. */
export function loginPath(next: string): string {
  return next === paths.home ? paths.login : `${paths.login}?next=${encodeURIComponent(next)}`
}
