import { create } from 'zustand'
import { getDb } from '@/engine/duckdb'
import { detectRelationships, relationshipId, type Relationship } from '@/engine/relationships'
import { isCancellation } from '@/lib/errors'
import { useDatasetsStore } from '@/stores/datasets'

// Suggested joins (F-PROF-07): detected again whenever the set of loaded tables changes. The user
// can dismiss one; dismissed joins aren't shown or sent (this session).

interface RelationshipsState {
  found: Relationship[]
  dismissed: string[]
  dismiss: (id: string) => void
}

export const useRelationshipsStore = create<RelationshipsState>()((set) => ({
  found: [],
  dismissed: [],
  dismiss: (id) => set((state) => ({ dismissed: [...state.dismissed, id] })),
}))

/** The joins among `tables` that the user hasn't dismissed. */
export function activeRelationships(tables: readonly string[]): Relationship[] {
  const { found, dismissed } = useRelationshipsStore.getState()
  const scope = new Set(tables)
  return found.filter(
    (r) =>
      scope.has(r.from.table) && scope.has(r.to.table) && !dismissed.includes(relationshipId(r)),
  )
}

let controller: AbortController | null = null
let timer = 0
let started = false

/** Watches the loaded tables (once, from App) and re-detects joins after a change settles. */
export function startRelationshipDetection(): void {
  if (started) return
  started = true
  useDatasetsStore.subscribe((state, previous) => {
    const key = (list: typeof state.datasets) =>
      list.map((d) => `${d.table}:${d.schemaHash}`).join()
    if (key(state.datasets) === key(previous.datasets)) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void detect(state.datasets), 400)
  })
}

async function detect(datasets: ReturnType<typeof useDatasetsStore.getState>['datasets']) {
  controller?.abort()
  if (datasets.length < 2) {
    useRelationshipsStore.setState({ found: [] })
    return
  }
  const current = new AbortController()
  controller = current
  try {
    const found = await detectRelationships(await getDb(), datasets, current.signal)
    if (controller === current) useRelationshipsStore.setState({ found })
  } catch (error) {
    if (!isCancellation(error)) console.warn('flashQuery: join detection failed', error)
  }
}
