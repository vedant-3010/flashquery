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
