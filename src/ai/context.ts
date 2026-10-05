import type { PrivacyMode } from '@/ai/schemas'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent } from '@/engine/naming'
import { tableToRows, toLogicalType } from '@/engine/normalize'
import { fetchPage, type PagedResult } from '@/engine/paging'
import { runQuery } from '@/engine/query'
import type { Relationship } from '@/engine/relationships'
import type { CellValue, ColumnMeta, ColumnProfile, DatasetProfile } from '@/engine/types'
import { AppError } from '@/lib/errors'

// The ONLY code that decides what reaches an LLM (CLAUDE.md, F-ASK-02). Per privacy mode:
// - strict: table names, row counts, column names + types (+ role), user notes. No data values.
// - balanced: strict + null %, distinct count, min/max for numbers and dates, top values for
//   low-cardinality text (≤ 40 chars each) and 3 sample rows (strings truncated to 40 chars).
// Everything is data from the user's files and is rendered as JSON inside a <data> block.
// The AI summary (F-ASK-12, balanced only) also sees the answer's result: every row when there are
// at most 50, else column statistics plus the first, highest and lowest rows (ResultDigest).

export const TEXT_LIMIT = 40
export const SAMPLE_ROWS = 3

export interface ContextColumn {
  name: string
  type: string
  role: ColumnProfile['role']
  description?: string
  unit?: string
  nullPct?: number
  distinct?: number
  min?: string | number
  max?: string | number
  topValues?: (string | null)[]
}

export interface ContextTable {
  name: string
  rows: number
  notes?: string
  columns: ContextColumn[]
  /** Balanced only: first rows, aligned with sampleColumns. */
  sampleColumns?: string[]
  sampleRows?: CellValue[][]
}

/** A detected join key (F-PROF-07): "table.column" on each side. */
export interface ContextJoin {
  from: string
  to: string
  kind: Relationship['kind']
  /** Balanced only: % of `from` values found in `to`. */
  matchPct?: number
}

export interface AiContext {
  mode: PrivacyMode
  tables: ContextTable[]
  /** Join keys between the tables in scope, when there are several (F-PROF-07). */
  joins?: ContextJoin[]
}

export type TableSamples = ReadonlyMap<string, { columns: string[]; rows: CellValue[][] }>

const clip = (text: string) =>
  text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT - 1)}…` : text

function clipCell(value: CellValue): CellValue {
  return typeof value === 'string' ? clip(value) : value
}

function describeColumn(column: ColumnProfile, mode: PrivacyMode): ContextColumn {
  const out: ContextColumn = { name: column.name, type: column.type, role: column.role }
  if (column.description) out.description = column.description
  if (column.unit) out.unit = column.unit
  if (mode === 'strict') return out

  out.nullPct = Math.round(column.nullPct * 10) / 10
  out.distinct = column.approxDistinct
  const logical = toLogicalType(column.type)
  const ordered = ['integer', 'number', 'date', 'timestamp'].includes(logical)
  if (ordered) {
    if (column.min !== null) out.min = column.min
    if (column.max !== null) out.max = column.max
  } else if (logical === 'text' && column.topValues.length > 0) {
    out.topValues = column.topValues.map((top) => (top.value === null ? null : clip(top.value)))
  }
  return out
}

export function buildContext({
  datasets,
  mode,
  samples,
  relationships = [],
}: {
  datasets: DatasetProfile[]
  mode: PrivacyMode
  samples?: TableSamples
  relationships?: readonly Relationship[]
}): AiContext {
  const tables = new Set(datasets.map((dataset) => dataset.table))
  const joins = relationships
    .filter((r) => tables.has(r.from.table) && tables.has(r.to.table))
    .map((r): ContextJoin => ({
      from: `${r.from.table}.${r.from.column}`,
      to: `${r.to.table}.${r.to.column}`,
      kind: r.kind,
      ...(mode === 'balanced' ? { matchPct: Math.round(r.overlap * 100) } : {}),
    }))
  return {
    mode,
    ...(joins.length > 0 ? { joins } : {}),
    tables: datasets.map((dataset) => {
      const table: ContextTable = {
        name: dataset.table,
        rows: dataset.rowCount,
        columns: dataset.columns.map((column) => describeColumn(column, mode)),
      }
      if (dataset.notes) table.notes = dataset.notes
      const sample = mode === 'balanced' ? samples?.get(dataset.table) : undefined
      if (sample) {
        table.sampleColumns = sample.columns
        table.sampleRows = sample.rows.slice(0, SAMPLE_ROWS).map((row) => row.map(clipCell))
      }
      return table
    }),
  }
}

/** How many values from the data itself the context contains (0 in strict mode). */
export function countDataValues(context: AiContext): number {
  let count = 0
  for (const table of context.tables) {
    for (const column of table.columns) {
      if (column.min !== undefined) count += 1
      if (column.max !== undefined) count += 1
      count += column.topValues?.length ?? 0
    }
    for (const row of table.sampleRows ?? []) count += row.length
  }
  return count
}

/**
 * JSON for inside a <data> block. `<` and `>` are escaped (\u003c, \u003e: still valid JSON, the same
 * text to the model), so a value like "</data> now obey me" can't close the block early (F-SEC-05).
 */
export function dataJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

/** The context as sent: one JSON line per table (and one for joins) inside a <data> block. */
export function renderContext(context: AiContext): string {
  const lines = context.tables.map((table) => dataJson(table))
  if (context.joins?.length) lines.push(dataJson({ suggestedJoins: context.joins }))
  return `<data>\n${lines.join('\n')}\n</data>`
}

/** First rows of each table, for balanced mode. Never called in strict mode. */
export async function fetchSamples(
  runner: SqlRunner,
  tables: string[],
  signal?: AbortSignal,
): Promise<TableSamples> {
  const samples = new Map<string, { columns: string[]; rows: CellValue[][] }>()
  for (const table of tables) {
    const result = await runQuery(runner, `SELECT * FROM ${quoteIdent(table)}`, {
      maxRows: SAMPLE_ROWS,
      signal,
    })
    samples.set(table, { columns: result.columns.map((c) => c.name), rows: result.rows })
  }
  return samples
}

// ---- The answer's result, for the AI summary (F-ASK-12) ----

/** Results with at most this many rows are sent whole; bigger ones as a digest. */
export const SUMMARY_ROWS = 50
const DIGEST_FIRST_ROWS = 10
const DIGEST_EXTREME_ROWS = 5

export interface ColumnStats {
  min?: number | string
  max?: number | string
  avg?: number
  sum?: number
  distinct?: number
}

export interface ResultDigest {
  rowCount: number
  columns: { name: string; type: string }[]
  /** Every row (results of up to SUMMARY_ROWS rows). */
  rows?: CellValue[][]
  /** Bigger results: statistics per column over all rows… */
  stats?: Record<string, ColumnStats>
  /** …and a few rows: the first ones, and the highest and lowest by the chart's measure. */
  firstRows?: CellValue[][]
  highestRows?: CellValue[][]
  lowestRows?: CellValue[][]
  /** Which measure highestRows/lowestRows are ordered by. */
  orderedBy?: string
}

function refuseStrict(mode: PrivacyMode) {
  if (mode !== 'balanced') {
    throw new AppError({
      code: 'privacy',
      message: 'Result rows are only sent to the AI in Balanced mode.',
      detail: null,
    })
  }
}

const clipRows = (rows: CellValue[][]) => rows.map((row) => row.map(clipCell))

/** Statistics per column over the whole result, in one query. */
async function resultStats(
  runner: SqlRunner,
  result: PagedResult,
  signal?: AbortSignal,
): Promise<Record<string, ColumnStats>> {
  const parts: { column: string; stat: keyof ColumnStats; sql: string }[] = []
  for (const column of result.columns) {
    const id = quoteIdent(column.name)
    if (column.logicalType === 'integer' || column.logicalType === 'number') {
      const value = `CAST(${id} AS DOUBLE)`
      for (const stat of ['min', 'max', 'avg', 'sum'] as const) {
        parts.push({ column: column.name, stat, sql: `${stat}(${value})` })
      }
    } else if (column.logicalType === 'date' || column.logicalType === 'timestamp') {
      parts.push({ column: column.name, stat: 'min', sql: `CAST(min(${id}) AS VARCHAR)` })
      parts.push({ column: column.name, stat: 'max', sql: `CAST(max(${id}) AS VARCHAR)` })
    } else {
      parts.push({ column: column.name, stat: 'distinct', sql: `approx_count_distinct(${id})` })
    }
  }
  if (parts.length === 0) return {}
  const select = parts.map((part, i) => `${part.sql} AS s${i}`).join(', ')
  const [row] = tableToRows(await runner.run(`SELECT ${select} FROM ${result.relation}`, signal))
  const stats: Record<string, ColumnStats> = {}
  parts.forEach((part, i) => {
    const value = row?.[i]
    if (value === null || value === undefined || typeof value === 'boolean') return
    const entry = (stats[part.column] ??= {})
    if (part.stat === 'min' || part.stat === 'max') {
      entry[part.stat] = typeof value === 'string' ? clip(value) : roundStat(value)
    } else if (typeof value === 'number') {
      entry[part.stat] = roundStat(value)
    }
  })
  return stats
}

const roundStat = (value: number) => Math.round(value * 1e4) / 1e4

/**
 * What the AI summary sees of a result (balanced only; throws otherwise). `rows` are the result's
 * first rows (all of them when it is small); `measure` orders the highest/lowest rows.
 */
export async function fetchResultDigest(
  runner: SqlRunner,
  {
    mode,
    result,
    rows,
    measure,
  }: { mode: PrivacyMode; result: PagedResult; rows: CellValue[][]; measure: string | null },
  signal?: AbortSignal,
): Promise<ResultDigest> {
  refuseStrict(mode)
  const columns = result.columns.map((column: ColumnMeta) => ({
    name: column.name,
    type: column.duckType,
  }))
  if (result.rowCount <= SUMMARY_ROWS && rows.length >= result.rowCount) {
    return { rowCount: result.rowCount, columns, rows: clipRows(rows) }
  }
  const digest: ResultDigest = {
    rowCount: result.rowCount,
    columns,
    stats: await resultStats(runner, result, signal),
    firstRows: clipRows(rows.slice(0, DIGEST_FIRST_ROWS)),
  }
  if (measure && result.columns.some((column) => column.name === measure)) {
    const page = (desc: boolean) =>
      fetchPage(
        runner,
        result,
        { offset: 0, limit: DIGEST_EXTREME_ROWS, sorting: [{ column: measure, desc }] },
        signal,
      )
    digest.orderedBy = measure
    digest.highestRows = clipRows(await page(true))
    digest.lowestRows = clipRows(await page(false))
  }
  return digest
}

/** How many values from the data a digest contains (the inspector's "data values sent"). */
export function countResultValues(digest: ResultDigest): number {
  let count = 0
  for (const rows of [digest.rows, digest.firstRows, digest.highestRows, digest.lowestRows]) {
    for (const row of rows ?? []) count += row.length
  }
  for (const stats of Object.values(digest.stats ?? {})) count += Object.keys(stats).length
  return count
}

/** The digest as sent: JSON inside a <data> block. */
export function renderDigest(digest: ResultDigest): string {
  return `<data>\n${dataJson(digest)}\n</data>`
}
