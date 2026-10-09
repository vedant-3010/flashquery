import { startTryDemo } from '@/app/tryDemo'
import { SAMPLES } from '@/engine/samples'
import { toAppError } from '@/lib/errors'
import { whenSaved } from '@/lib/idb'
import { useAskStore } from '@/stores/ask'
import { flushDashboardSave, useDashboardStore } from '@/stores/dashboard'
import { useDatasetsStore } from '@/stores/datasets'
import { useHistoryStore } from '@/stores/history'
import { useNotesStore } from '@/stores/notes'
import {
  restorePersistedDatasets,
  startFilePersistence,
  whenFilesSaved,
} from '@/stores/persistFiles'
import { setProjectScope } from '@/stores/projectScope'
import { useProjectsStore, type ProjectSummary } from '@/stores/projects'
import { takeStart, type StartAction } from '@/stores/projectStart'
import { useSettingsStore } from '@/stores/settings'
import { useSuggestionsStore } from '@/stores/suggestions'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import { importWorkspace } from '@/stores/workspace'

// Opening a project (F-HOME-02, D113). A page holds one project: its stores load from the project's
// records and the engine holds its tables. Opening another project saves what's pending and reloads
// the page at the new URL, so nothing carries over: no tables, answers or running jobs.

export type OpenOutcome = 'open' | 'missing' | 'reloading'

let opening: { id: string; promise: Promise<OpenOutcome> } | null = null

/** Opens project `id` in this page (idempotent), or reloads into it when another one is open. */
export function openProject(id: string): Promise<OpenOutcome> {
  if (opening?.id === id) return opening.promise
  const promise = open(id)
  opening = { id, promise }
  return promise
}

/** Whether opening `id` needs a fresh page (another project is open here). */
export function needsReload(id: string): boolean {
  const open = useProjectsStore.getState().openId
  return open !== null && open !== id
}

/** Saves everything pending, then reloads the page (its URL already names the next project). */
export async function reloadForProject(): Promise<void> {
  flushDashboardSave()
  await whenFilesSaved()
  await whenSaved()
  window.location.reload()
}

async function open(id: string): Promise<OpenOutcome> {
  await useProjectsStore.getState().hydrate()
  if (!useProjectsStore.getState().projects.some((project) => project.id === id)) return 'missing'
  if (needsReload(id)) {
    await reloadForProject()
    return 'reloading'
  }
  setProjectScope(id)
  useProjectsStore.getState().setOpen(id)
  await useSettingsStore.getState().hydrate()
  await Promise.all([
    useHistoryStore.getState().hydrate(),
    useDashboardStore.getState().hydrate(),
    useNotesStore.getState().hydrate(),
    useSuggestionsStore.getState().hydrate(),
  ])
  startFilePersistence()
  if (useSettingsStore.getState().persistFiles) await restorePersistedDatasets()
  trackSummary(id)
  return 'open'
}

/**
 * Runs what Home queued for project `id` (each time the project's page is entered: it may already
 * be open in this page).
 */
export async function runPendingStart(id: string): Promise<void> {
  const start = await takeStart(id)
  if (start) runStart(start)
}

/** Keeps the project's card on Home current: its datasets, dashboards and questions. */
function trackSummary(id: string) {
  const summary = (): ProjectSummary => ({
    datasets: useDatasetsStore.getState().datasets.map((dataset) => dataset.label),
    dashboards: useDashboardStore.getState().dashboards.length,
    questions: useHistoryStore.getState().entries.filter((entry) => entry.kind === 'question')
      .length,
  })
  const update = (withDatasets: boolean) => {
    const current = useProjectsStore.getState().projects.find((project) => project.id === id)
    if (!current) return
    const next = summary()
    // Datasets come back only with kept files: an empty sidebar after a reload keeps the list.
    useProjectsStore
      .getState()
      .updateSummary(id, withDatasets ? next : { ...next, datasets: current.datasets })
  }
  update(useDatasetsStore.getState().datasets.length > 0)
  useDatasetsStore.subscribe((state, previous) => {
    if (state.datasets !== previous.datasets) update(true)
  })
  useDashboardStore.subscribe((state, previous) => {
    if (state.dashboards !== previous.dashboards) update(false)
  })
  useHistoryStore.subscribe((state, previous) => {
    if (state.entries !== previous.entries) update(false)
  })
}

function runStart(action: StartAction) {
  switch (action.kind) {
    case 'sample': {
      // Already there (kept files bring samples back) or on its way: don't load it twice.
      const table = SAMPLES.find((sample) => sample.id === action.sampleId)?.table
      const { datasets, jobs } = useDatasetsStore.getState()
      if (datasets.some((d) => d.table === table) || jobs.some((job) => job.table === table)) return
      useDatasetsStore.getState().loadSample(action.sampleId)
      return
    }
    case 'files':
      useDatasetsStore.getState().addFiles(action.files)
      return
    case 'import':
      try {
        const added = importWorkspace(action.text)
        useToastStore
          .getState()
          .show(
            `Imported ${added.dashboards} dashboards, ${added.history} history entries and notes for ${added.notes} datasets.`,
          )
      } catch (error) {
        useToastStore.getState().show(`Couldn't import: ${toAppError(error).message}`)
      }
      return
    case 'ask':
      // Ask once kept files are back; with no data (kept files off), leave it in the box.
      void whenDatasetsSettled().then(() => {
        if (useDatasetsStore.getState().datasets.length > 0) {
          void useAskStore.getState().ask(action.question)
        } else {
          useUiStore.getState().setDraftQuestion(action.question)
        }
      })
      return
    case 'try':
      startTryDemo()
  }
}

/** Resolves when no dataset is loading (failed ones and sheet choices wait for the user). */
function whenDatasetsSettled(): Promise<void> {
  const busy = () =>
    useDatasetsStore
      .getState()
      .jobs.some((job) => job.status === 'loading' || job.status === 'profiling')
  if (!busy()) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = useDatasetsStore.subscribe(() => {
      if (busy()) return
      stop()
      resolve()
    })
  })
}
