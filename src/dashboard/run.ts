import type { ChartHint } from '@/ai/schemas'
import { analyze } from '@/charts/classify'
import { keepChoices, respec, selectFor } from '@/charts/select'
import type { ChartSpec } from '@/charts/spec'
import type { DatasetRef, Snapshot, TileType } from '@/dashboard/schema'
import { loadChartData, readChartRows } from '@/engine/chartData'
import type { SqlRunner } from '@/engine/connection'
import { createFilterViews, rewriteTables, type DashboardFilter } from '@/engine/filters'
import { closeResult, openQuery } from '@/engine/paging'
import { DEFAULT_TIMEOUT_MS } from '@/engine/query'
import { guardSql, parseSelect, tablesRead } from '@/engine/sqlGuard'
import type { CellValue, ColumnMeta, DatasetProfile } from '@/engine/types'

// Running a tile (F-DASH-01/04/07/09/10): the SQL passes the guard (tiles can come from the AI or
// an imported file), the dashboard's filters are applied, and the result becomes a snapshot of at
// most 5,000 rows: the chart's own data, or the first rows for tables.

export interface TileRunInput {
  sql: string
  /** The tile's chart: kept when it still fits the result; else chosen again (hint first). */
  spec: ChartSpec | null
  /** A table tile, or a chart (or KPI) tile. */
  asTable: boolean
  title?: string
  question?: string | null
  hint?: ChartHint | null
  currency?: string | null
  datasets: readonly DatasetProfile[]
  filters: readonly DashboardFilter[]
  signal?: AbortSignal
}

export interface TileRunResult {
  type: Exclude<TileType, 'text'>
  /** The guarded SQL (as written, without the filters). */
  sql: string
  spec: ChartSpec | null
  snapshot: Snapshot
  datasetRefs: DatasetRef[]
  /** For the edit sheet's chart switcher. */
  columns: ColumnMeta[]
  rows: CellValue[][]
}

export function datasetRefsFor(tables: readonly string[], datasets: readonly DatasetProfile[]) {
  return tables.flatMap((table): DatasetRef[] => {
    const dataset = datasets.find((d) => d.table.toLowerCase() === table.toLowerCase())
    if (!dataset) return []
    return [
      {
        table: dataset.table,
        schemaHash: dataset.schemaHash,
        label: dataset.label,
        fileName: dataset.source.fileName,
        sample: dataset.source.kind === 'sample',
      },
    ]
  })
}

export type RefCheck = { ok: true } | { ok: false; message: string }

/** Whether a tile's tables are loaded as they were (same schemaHash); else what to re-load. */
export function checkRefs(
  refs: readonly DatasetRef[],
  datasets: readonly DatasetProfile[],
): RefCheck {
  for (const ref of refs) {
    const dataset = datasets.find((d) => d.table === ref.table)
    if (dataset && dataset.schemaHash === ref.schemaHash) continue
    const what = ref.sample ? `the ${ref.label} sample` : (ref.fileName ?? ref.label)
    const message = dataset
      ? `${ref.table} has different columns now. Re-load ${what} to refresh.`
      : ref.sample
        ? `Load ${what} to refresh.`
        : `Re-upload ${what} to refresh.`
    return { ok: false, message }
  }
  return { ok: true }
}

export async function runTile(runner: SqlRunner, input: TileRunInput): Promise<TileRunResult> {
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
    : AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  const tables = input.datasets.map((dataset) => dataset.table)
  const sql = await guardSql(runner, input.sql, { tables, signal })
  const { statement } = await parseSelect(runner, sql, signal)
  const read = tablesRead(statement)
  const filters = input.filters.filter((filter) => read.includes(filter.table.toLowerCase()))
  const views = await createFilterViews(runner, filters, signal)
  const run = views.size > 0 ? await rewriteTables(runner, sql, views, signal) : sql

  const result = await openQuery(runner, run, signal)
  try {
    const rows = await readChartRows(runner, result, signal)
    const base = {
      sql,
      datasetRefs: datasetRefsFor(read, input.datasets),
      columns: result.columns,
      rows,
    }
    const at = Date.now()
    if (input.asTable) {
      return {
        ...base,
        type: 'table',
        spec: input.spec,
        snapshot: {
          columns: result.columns,
          rows,
          rowCount: result.rowCount,
          sampling: rows.length >= result.rowCount ? 'none' : 'head',
          at,
          filtered: views.size > 0,
        },
      }
    }
    const shape = analyze(result.columns, rows, result.rowCount)
    const context = {
      question: input.question ?? '',
      title: input.title,
      currency: input.currency ?? null,
    }
    const kept =
      input.spec && input.spec.type !== 'table'
        ? respec(
            shape,
            input.spec,
            { x: input.spec.x, y: input.spec.y, series: input.spec.series, size: input.spec.size },
            context,
          )
        : null
    // The chart the user chose, while it still fits; else a fresh pick that keeps their colors.
    const fresh = () => selectFor(shape, { ...context, hint: input.hint })
    const spec = kept?.ok ? kept.spec : input.spec ? keepChoices(input.spec, fresh()) : fresh()
    const data = await loadChartData(runner, result, spec, rows, signal)
    return {
      ...base,
      type: spec.type === 'kpi' ? 'kpi' : spec.type === 'table' ? 'table' : 'chart',
      spec,
      snapshot: { ...data, at, filtered: views.size > 0 },
    }
  } finally {
    await closeResult(runner, result)
  }
}
