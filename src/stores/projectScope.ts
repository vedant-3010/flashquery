import type { RecordSpec } from '@/lib/idb'

// The open project (F-HOME-02, D113): its history, dashboards, notes, suggestions and kept-file
// manifest live under IndexedDB keys `p:<id>:<key>`. The scope is set once per page, when a project
// opens; opening another project reloads the page, so each store still loads once.

/** The records each project has its own copy of (settings and eval cases stay global). */
export const PROJECT_RECORD_KEYS = [
  'history',
  'dashboards',
  'notes',
  'suggestions',
  'persistedDatasets',
] as const

let current: string | null = null

export const projectKey = (projectId: string, key: string) => `p:${projectId}:${key}`

/** The project this page has open, or null (Home before any project was opened). */
export function projectScope(): string | null {
  return current
}

export function setProjectScope(projectId: string): void {
  if (current !== null && current !== projectId) {
    throw new Error('flashQuery: another project is already open in this page')
  }
  current = projectId
}

/** `spec` for the open project. Throws when none is open: project data never goes to a global key. */
export function inProject<T>(spec: RecordSpec<T>): RecordSpec<T> {
  if (current === null) throw new Error(`flashQuery: no project is open to load "${spec.key}"`)
  return { ...spec, key: projectKey(current, spec.key) }
}
