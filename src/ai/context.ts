import type { PrivacyMode } from '@/ai/schemas'
import type { SqlRunner } from '@/engine/connection'
import { quoteIdent } from '@/engine/naming'
import { toLogicalType } from '@/engine/normalize'
import { runQuery } from '@/engine/query'
import type { CellValue, ColumnProfile, DatasetProfile } from '@/engine/types'

// The ONLY code that decides what reaches an LLM (CLAUDE.md, F-ASK-02). Per privacy mode:
// - strict: table names, row counts, column names + types (+ role), user notes. No data values.
// - balanced: strict + null %, distinct count, min/max for numbers and dates, top values for
//   low-cardinality text (≤ 40 chars each) and 3 sample rows (strings truncated to 40 chars).
// Everything is data from the user's files and is rendered as JSON inside a <data> block.

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

export interface AiContext {
  mode: PrivacyMode
  tables: ContextTable[]
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
}: {
  datasets: DatasetProfile[]
  mode: PrivacyMode
  samples?: TableSamples
}): AiContext {
  return {
    mode,
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

/** The context as sent: one JSON line per table inside a <data> block. */
export function renderContext(context: AiContext): string {
  const lines = context.tables.map((table) => JSON.stringify(table))
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
