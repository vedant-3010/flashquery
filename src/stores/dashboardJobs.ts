import { generateDashboard, type GenerateProgress } from '@/ai/dashboard'
import type { ChartSpec } from '@/charts/spec'
import { planLayout } from '@/dashboard/layout'
import { checkRefs, runTile } from '@/dashboard/run'
import { DashboardFileSchema, type DashboardFile, type DashboardTile } from '@/dashboard/schema'
import { getDb } from '@/engine/duckdb'
import { AppError, toAppError } from '@/lib/errors'
import type { Answer } from '@/stores/ask'
import { currentProvider, logRequest, today } from '@/stores/askSupport'
import { findTile, useDashboardStore } from '@/stores/dashboard'
import { useDatasetsStore } from '@/stores/datasets'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

// Dashboard work that runs SQL: pinning (F-DASH-01), refreshing with the schemaHash check
// (F-DASH-04), filters (F-DASH-10), generating (F-DASH-09), export and import (F-DASH-08).

const store = () => useDashboardStore.getState()
const datasets = () => useDatasetsStore.getState().datasets

function showDashboard(id: string, tileId?: string) {
  store().setActive(id)
  useUiStore.getState().setView('dashboard')
  if (tileId) useUiStore.getState().setFocusTile(tileId)
}

interface PinInput {
  title: string
  sql: string
  spec: ChartSpec | null
  asTable: boolean
  question: string | null
  edited: boolean
}

/** Runs the SQL on the active dashboard (with its filters) and adds it as a tile. */
async function pin(input: PinInput): Promise<void> {
  const dashboardId = store().ensureActive()
  const dashboard = store().dashboards.find((d) => d.id === dashboardId)
  const result = await runTile(await getDb(), {
    sql: input.sql,
    spec: input.spec,
    asTable: input.asTable,
    title: input.title,
    question: input.question,
    currency: useSettingsStore.getState().currency,
    datasets: datasets(),
    filters: dashboard?.filters ?? [],
  })
  const tileId = store().addTile(dashboardId, {
    type: result.type,
    title: input.title,
    sql: result.sql,
    chartSpec: result.spec,
    text: null,
    datasetRefs: result.datasetRefs,
    snapshot: result.snapshot,
    question: input.question,
    edited: input.edited,
  })
  store().setStatus(tileId, { state: 'live', message: null })
  const name = store().dashboards.find((d) => d.id === dashboardId)?.name ?? 'the dashboard'
  useToastStore.getState().show(`Pinned to ${name}.`, {
    label: 'View',
    run: () => showDashboard(dashboardId, tileId),
  })
}

/** Pins an answer as a chart (or KPI) tile, or as a table (F-DASH-01). */
export function pinAnswer(answer: Answer, asTable: boolean): Promise<void> {
  if (!answer.sql) return Promise.resolve()
  return pin({
    title: answer.plan?.title ?? answer.question,
    sql: answer.sql,
    spec: answer.chart?.spec ?? null,
    asTable,
    question: answer.question,
    edited: answer.edited,
  })
}

/** Pins a query from history (F-EXPL-05); the chart is chosen automatically. */
export function pinQuery({ title, sql }: { title: string; sql: string }): Promise<void> {
  return pin({ title, sql, spec: null, asTable: false, question: null, edited: false })
}

/** Adds a text tile with starter markdown (F-DASH-06). */
export function addTextTile(): string {
  const dashboardId = store().ensureActive()
  return store().addTile(dashboardId, {
    type: 'text',
    title: 'Notes',
    sql: null,
    chartSpec: null,
    text: '## Notes\n\nWrite **markdown** here: headings, lists, *emphasis* and links.',
    datasetRefs: [],
    snapshot: null,
    question: null,
    edited: false,
  })
}

const refreshing = new Set<string>()

/** Re-runs one tile on the loaded data, with its dashboard's filters (F-DASH-04). */
export async function refreshTile(tileId: string): Promise<void> {
  const found = findTile(store().dashboards, tileId)
  const sql = found?.tile.sql
  if (!found || found.tile.type === 'text' || !sql || refreshing.has(tileId)) return
  const { tile, dashboard } = found
  const check = checkRefs(tile.datasetRefs, datasets())
  if (!check.ok) {
    store().setStatus(tileId, { state: 'stale', message: check.message })
    return
  }
  refreshing.add(tileId)
  store().setStatus(tileId, { state: 'refreshing', message: null })
  try {
    const result = await runTile(await getDb(), {
      sql,
      spec: tile.chartSpec,
      asTable: tile.type === 'table',
      title: tile.title,
      question: tile.question,
      currency: useSettingsStore.getState().currency,
      datasets: datasets(),
      filters: dashboard.filters,
    })
    store().updateTile(tileId, {
      snapshot: result.snapshot,
      chartSpec: result.spec,
      datasetRefs: result.datasetRefs,
      type: tile.type === 'table' ? 'table' : result.type,
    })
    store().setStatus(tileId, { state: 'live', message: null })
  } catch (error) {
    store().setStatus(tileId, { state: 'error', message: toAppError(error).message })
  } finally {
    refreshing.delete(tileId)
  }
}

/** "Refresh all": every tile of a dashboard, one after another (DuckDB runs one query at a time). */
export async function refreshAll(dashboardId: string): Promise<void> {
  const dashboard = store().dashboards.find((d) => d.id === dashboardId)
  for (const tile of dashboard?.tiles ?? []) await refreshTile(tile.id)
}

/**
 * Tiles show their snapshot first; this refreshes the ones whose tables are loaded (and match),
 * once per session, and marks the rest as out of date with what to re-load.
 */
export async function refreshWhenReady(dashboardId: string): Promise<void> {
  const dashboard = store().dashboards.find((d) => d.id === dashboardId)
  for (const tile of dashboard?.tiles ?? []) {
    if (tile.type === 'text') continue
    const status = store().status[tile.id]
    if (status?.state === 'live' || status?.state === 'refreshing' || status?.state === 'error') {
      continue
    }
    const check = checkRefs(tile.datasetRefs, datasets())
    if (check.ok) await refreshTile(tile.id)
    else if (status?.state !== 'stale' || status.message !== check.message) {
      store().setStatus(tile.id, { state: 'stale', message: check.message })
    }
  }
}

/** New filters for a dashboard, then every tile again (F-DASH-10). */
export function applyFilters(
  dashboardId: string,
  filters: Parameters<ReturnType<typeof store>['setFilters']>[1],
): Promise<void> {
  store().setFilters(dashboardId, filters)
  return refreshAll(dashboardId)
}

/** "Generate dashboard" for one dataset (F-DASH-09): a new dashboard with the proposed tiles. */
export async function generate({
  datasetId,
  focus,
  signal,
  onProgress,
}: {
  datasetId: string
  focus?: string
  signal: AbortSignal
  onProgress: (progress: GenerateProgress) => void
}): Promise<{ dashboardId: string; failed: { title: string; error: string }[] }> {
  const all = datasets()
  const dataset = all.find((d) => d.id === datasetId)
  if (!dataset) {
    throw new AppError({ code: 'no_data', message: 'Load a dataset first.', detail: null })
  }
  const settings = useSettingsStore.getState()
  const generated = await generateDashboard({
    provider: await currentProvider(),
    engine: await getDb(),
    dataset,
    datasets: all,
    mode: settings.privacyMode,
    focus,
    currency: settings.currency,
    today: today(),
    signal,
    onProgress,
    onLog: logRequest,
  })
  const layouts = planLayout(generated.tiles.map((t) => ({ size: t.size, type: t.type })))
  const dashboardId = store().createDashboard(generated.title)
  generated.tiles.forEach((tile, index) => {
    const layout = layouts[index]
    const tileId = store().addTile(dashboardId, {
      type: tile.type,
      title: tile.title,
      sql: tile.sql,
      chartSpec: tile.spec,
      text: null,
      datasetRefs: tile.datasetRefs,
      snapshot: tile.snapshot,
      question: null,
      edited: false,
      layout,
    })
    store().setStatus(tileId, { state: 'live', message: null })
  })
  showDashboard(dashboardId)
  return { dashboardId, failed: generated.failed }
}

/** The dashboard as a JSON file (F-DASH-08). Without snapshots it holds no data, only SQL. */
export function exportDashboard(
  dashboardId: string,
  { snapshots }: { snapshots: boolean },
): { fileName: string; json: string } | null {
  const dashboard = store().dashboards.find((d) => d.id === dashboardId)
  if (!dashboard) return null
  const file: DashboardFile = {
    format: 'askdata-dashboard',
    version: 1,
    exportedAt: Date.now(),
    dashboard: {
      ...dashboard,
      tiles: dashboard.tiles.map((tile): DashboardTile =>
        snapshots ? tile : { ...tile, snapshot: null },
      ),
    },
  }
  const base = dashboard.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return { fileName: `${base || 'dashboard'}.askdata.json`, json: JSON.stringify(file, null, 2) }
}

/** Reads an exported file; anything that doesn't match the schema is refused (F-DASH-08). */
export function importDashboard(text: string): string {
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
  const parsed = DashboardFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError({
      code: 'import_invalid',
      message: "This isn't an AskData dashboard file (or it is from a newer version).",
      detail: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n'),
    })
  }
  const id = store().importDashboard(parsed.data)
  showDashboard(id)
  return id
}
