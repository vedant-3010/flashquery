import { z } from '@/lib/zod'
import { appUrl, paths } from '@/app/paths'
import { DashboardSchema, type DashboardTile } from '@/dashboard/schema'
import { idbStore } from '@/lib/idb'
import { clearOpfs } from '@/lib/opfs'
import { AppError } from '@/lib/errors'
import { THEME_STORAGE_KEY } from '@/lib/theme'
import { useDashboardStore } from '@/stores/dashboard'
import { HistoryEntrySchema, useHistoryStore } from '@/stores/history'
import { EvalCaseSchema, useFeedbackStore } from '@/stores/feedback'
import { DatasetNotesSchema, useNotesStore } from '@/stores/notes'

// Workspace bundle (F-EXP-03): history, dashboards, notes and eval cases in one JSON file, without data rows
// unless the user opts in to dashboard snapshots. Clear all local data (F-EXP-04).

export const WorkspaceFileSchema = z.object({
  format: z.literal('flashQuery-workspace'),
  version: z.literal(1),
  exportedAt: z.number(),
  history: z.array(HistoryEntrySchema),
  dashboards: z.array(DashboardSchema),
  notes: z.record(z.string(), DatasetNotesSchema),
  evalCases: z.array(EvalCaseSchema).default([]),
})
export type WorkspaceFile = z.infer<typeof WorkspaceFileSchema>

export function exportWorkspace({ snapshots }: { snapshots: boolean }): {
  fileName: string
  json: string
} {
  const file: WorkspaceFile = {
    format: 'flashQuery-workspace',
    version: 1,
    exportedAt: Date.now(),
    history: useHistoryStore.getState().entries,
    dashboards: useDashboardStore.getState().dashboards.map((dashboard) => ({
      ...dashboard,
      tiles: dashboard.tiles.map((tile): DashboardTile =>
        snapshots ? tile : { ...tile, snapshot: null },
      ),
    })),
    notes: useNotesStore.getState().bySchema,
    evalCases: useFeedbackStore.getState().cases,
  }
  const day = new Date(file.exportedAt).toISOString().slice(0, 10)
  return { fileName: `flashQuery-workspace-${day}.json`, json: JSON.stringify(file, null, 2) }
}

/** Adds an exported workspace to this one: history and notes merge, dashboards come in as copies. */
export function importWorkspace(text: string): {
  history: number
  dashboards: number
  notes: number
} {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AppError({
      code: 'import_invalid',
      message: "This file isn't valid JSON.",
      detail: null,
    })
  }
  const parsed = WorkspaceFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError({
      code: 'import_invalid',
      message: "This isn't an flashQuery workspace file (or it is from a newer version).",
      detail: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n'),
    })
  }
  const file = parsed.data
  const known = new Set(useHistoryStore.getState().entries.map((entry) => entry.id))
  const added = file.history.filter((entry) => !known.has(entry.id))
  useHistoryStore.setState((state) => ({
    entries: [...state.entries, ...added].sort((a, b) => b.at - a.at).slice(0, 200),
  }))
  const dashboards = useDashboardStore.getState()
  for (const dashboard of file.dashboards) {
    dashboards.importDashboard({
      format: 'flashQuery-dashboard',
      version: 1,
      exportedAt: file.exportedAt,
      dashboard,
    })
  }
  useNotesStore.setState((state) => ({ bySchema: { ...state.bySchema, ...file.notes } }))
  useFeedbackStore.setState((state) => {
    const ids = new Set(state.cases.map((c) => c.id))
    return { cases: [...state.cases, ...file.evalCases.filter((c) => !ids.has(c.id))] }
  })
  return {
    history: added.length,
    dashboards: file.dashboards.length,
    notes: Object.keys(file.notes).length,
  }
}

/** Removes everything flashQuery saved in this browser (a sign-in too), then starts again on Home (F-EXP-04). */
export async function clearLocalData(): Promise<void> {
  await idbStore.clear()
  await clearOpfs()
  localStorage.removeItem(THEME_STORAGE_KEY)
  // A saved sign-in (supabase-js keeps it as sb-…): this browser forgets it too (F-ACCT-04).
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-')) localStorage.removeItem(key)
  }
  window.location.assign(appUrl(paths.home))
}
