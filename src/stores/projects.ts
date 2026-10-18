import { z } from '@/lib/zod'
import { create } from 'zustand'
import {
  idbStore,
  loadRecord,
  saveRecord,
  whenSaved,
  type KeyValueStore,
  type RecordSpec,
} from '@/lib/idb'
import { mergeRemoved, RemovedProjectSchema, type RemovedProject } from '@/lib/syncMerge'
import { DASHBOARDS_RECORD } from '@/stores/dashboard'
import { HISTORY_RECORD } from '@/stores/history'
import { backupCorruptRecord } from '@/stores/persistence'
import { PERSISTED_RECORD } from '@/stores/keptDatasets'
import { forgetProjectFiles } from '@/stores/persistFiles'
import { PROJECT_RECORD_KEYS, projectKey } from '@/stores/projectScope'

// Projects (F-HOME-02, D113): each has its own datasets (kept files), history, notes, dashboards
// and suggestions under `p:<id>:…` keys; settings and eval cases stay global. The list itself is
// one global record. Data saved before projects existed moves into "My first project".
// Signed in, projects save to the account, encrypted (M17, src/stores/sync.ts), unless marked
// "Keep on this device only"; a deleted one leaves a marker so it goes from every device.

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastOpenedAt: z.number(),
  /** For Home's cards, kept up to date while the project is open: the datasets last loaded… */
  datasets: z.array(z.string()),
  /** …how many dashboards and questions it has. */
  dashboards: z.number(),
  questions: z.number(),
  /** "Keep on this device only" (M17): never saved to the account. */
  localOnly: z.boolean(),
})
export type Project = z.infer<typeof ProjectSchema>
export type ProjectSummary = Pick<Project, 'datasets' | 'dashboards' | 'questions'>

export const PROJECTS_RECORD: RecordSpec<Project[]> = {
  key: 'projects',
  version: 2,
  schema: z.array(ProjectSchema),
  migrations: {
    // v2 (M17): projects save to the account unless kept on this device.
    1: (data) =>
      Array.isArray(data) ? data.map((p: object) => ({ ...p, localOnly: false })) : data,
  },
  fallback: () => [],
}

/** Projects removed from the account (deleted, or kept on one device only), for the other devices. */
export const REMOVED_PROJECTS_RECORD: RecordSpec<RemovedProject[]> = {
  key: 'removedProjects',
  version: 1,
  schema: z.array(RemovedProjectSchema),
  fallback: () => [],
}

/** The migrated project's id is fixed, so a migration cut short can simply run again. */
export const FIRST_PROJECT_ID = 'my-first-project'
export const FIRST_PROJECT_NAME = 'My first project'
export const MAX_NAME_LENGTH = 80

export function newProject(name: string, now = Date.now()): Project {
  return {
    id: `p_${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim().slice(0, MAX_NAME_LENGTH) || 'Untitled project',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    datasets: [],
    dashboards: 0,
    questions: 0,
    localOnly: false,
  }
}

/** "Untitled project", then "Untitled project 2", … */
export function nextName(projects: readonly Pick<Project, 'name'>[], base = 'Untitled project') {
  const taken = new Set(projects.map((project) => project.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

/** A project's card from its saved records, without opening it (after the migration). */
export async function summarizeSaved(
  projectId: string,
  store: KeyValueStore = idbStore,
): Promise<ProjectSummary> {
  const read = <T>(spec: RecordSpec<T>) =>
    loadRecord({ ...spec, key: projectKey(projectId, spec.key) }, { store, readOnly: true }).catch(
      () => spec.fallback(),
    )
  const [history, dashboards, kept] = await Promise.all([
    read(HISTORY_RECORD),
    read(DASHBOARDS_RECORD),
    read(PERSISTED_RECORD),
  ])
  return {
    datasets: kept.map((entry) => entry.label),
    dashboards: dashboards.dashboards.length,
    questions: history.filter((entry) => entry.kind === 'question').length,
  }
}

/**
 * Moves data saved before projects (v1 keys: history, dashboards, …) into "My first project": each
 * record is copied as saved (its version migrates on load), the list is saved, then the old keys go.
 * Returns the projects, or null when there was nothing to move.
 */
export async function migrateLegacyData(
  store: KeyValueStore = idbStore,
): Promise<Project[] | null> {
  const found: string[] = []
  for (const key of PROJECT_RECORD_KEYS) {
    const raw = await store.get(key)
    if (raw === undefined) continue
    await store.set(projectKey(FIRST_PROJECT_ID, key), raw)
    found.push(key)
  }
  if (found.length === 0) return null
  const project: Project = {
    ...newProject(FIRST_PROJECT_NAME),
    id: FIRST_PROJECT_ID,
    ...(await summarizeSaved(FIRST_PROJECT_ID, store)),
  }
  await saveRecord(PROJECTS_RECORD, [project], { store })
  for (const key of found) await store.del(key)
  return [project]
}

interface ProjectsState {
  projects: Project[]
  /** Removed from the account: other devices remove (or stop syncing) them too. */
  removed: RemovedProject[]
  hydrated: boolean
  /** The project this page has open (null until one is): opening another one reloads the page. */
  openId: string | null
  hydrate: () => Promise<void>
  /** `id`: a fixed id (the try project); otherwise a new random one. */
  create: (name?: string, id?: string) => Project
  rename: (id: string, name: string) => void
  /** Deletes the project, its records and its kept files; resolves once that is saved. */
  remove: (id: string) => Promise<void>
  setOpen: (id: string) => void
  updateSummary: (id: string, summary: ProjectSummary) => void
  /** "Keep on this device only" on or off (the sync removes or saves the account's copy). */
  setLocalOnly: (id: string, localOnly: boolean) => void
  /** Another device's changes (the account sync): the merged list, and projects deleted there. */
  applyMerged: (projects: Project[], removed: RemovedProject[], deleted: string[]) => Promise<void>
}

/** A project's records and kept files, gone from this device. */
async function forgetProject(id: string) {
  await forgetProjectFiles(id)
  const prefix = projectKey(id, '')
  for (const key of await idbStore.keys()) {
    if (key.startsWith(prefix)) await idbStore.del(key)
  }
}

let hydrating: Promise<void> | null = null

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  removed: [],
  hydrated: false,
  openId: null,
  hydrate: () => (hydrating ??= load()),
  create: (name, id) => {
    const made = newProject(name ?? nextName(get().projects))
    const project = id ? { ...made, id } : made
    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },
  rename: (id, name) => {
    const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
    if (!trimmed) return
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
      ),
    }))
  },
  remove: async (id) => {
    const project = get().projects.find((p) => p.id === id)
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      removed:
        project && !project.localOnly
          ? mergeRemoved(state.removed, [{ id, at: Date.now(), kind: 'deleted' }])
          : state.removed,
    }))
    await forgetProject(id)
    // The shorter list is saved too, so a reload right after can't bring the project back.
    await whenSaved()
  },
  setOpen: (id) =>
    set((state) => ({
      openId: id,
      projects: state.projects.map((p) => (p.id === id ? { ...p, lastOpenedAt: Date.now() } : p)),
    })),
  updateSummary: (id, summary) =>
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== id) return p
        const same =
          p.dashboards === summary.dashboards &&
          p.questions === summary.questions &&
          p.datasets.join('\n') === summary.datasets.join('\n')
        return same ? p : { ...p, ...summary, updatedAt: Date.now() }
      }),
    })),
  setLocalOnly: (id, localOnly) => {
    const now = Date.now()
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, localOnly, updatedAt: now } : p)),
      removed: localOnly
        ? mergeRemoved(state.removed, [{ id, at: now, kind: 'unsynced' }])
        : state.removed.filter((marker) => marker.id !== id),
    }))
  },
  applyMerged: async (projects, removed, deleted) => {
    set({ projects, removed })
    for (const id of deleted) await forgetProject(id)
    await whenSaved()
  },
}))

async function load() {
  const saved = await loadRecord(PROJECTS_RECORD, { onCorrupt: backupCorruptRecord })
    .then(async (projects) =>
      projects.length > 0 ? projects : ((await migrateLegacyData()) ?? projects),
    )
    .catch((error: unknown) => {
      console.warn('HushGlance: projects could not be loaded', error)
      return []
    })
  const removed = await loadRecord(REMOVED_PROJECTS_RECORD, {
    onCorrupt: backupCorruptRecord,
  }).catch(() => [])
  useProjectsStore.setState((state) => ({
    projects: [
      ...state.projects,
      ...saved.filter((p) => !state.projects.some((q) => q.id === p.id)),
    ],
    removed: mergeRemoved(state.removed, removed),
    hydrated: true,
  }))
  useProjectsStore.subscribe((state, previous) => {
    if (state.projects !== previous.projects) {
      saveRecord(PROJECTS_RECORD, state.projects).catch((error: unknown) =>
        console.warn('HushGlance: projects could not be saved', error),
      )
    }
    if (state.removed !== previous.removed) {
      saveRecord(REMOVED_PROJECTS_RECORD, state.removed).catch((error: unknown) =>
        console.warn('HushGlance: removed projects could not be saved', error),
      )
    }
  })
}
