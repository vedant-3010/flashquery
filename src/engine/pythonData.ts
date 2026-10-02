import type { Engine } from '@/engine/connection'
import { exportQuery } from '@/engine/export'
import { quoteIdent, quoteLiteral } from '@/engine/naming'
import { openQuery, type PagedResult } from '@/engine/paging'

// Data in and out of Python (F-PY-04, data-engine rules): the plan's guarded query becomes CSV for
// pandas (a repeatable sample above 200k rows, and the UI says so); Python's `result` comes back as
// CSV and becomes a temp table, so it gets the normal grid, chart and summary.

export const PYTHON_ROW_CAP = 200_000

export interface PythonInput {
  csv: Uint8Array
  /** Rows sent to Python. */
  rows: number
  /** The input had more rows than PYTHON_ROW_CAP and was sampled. */
  sampled: boolean
  /** Columns for pandas to parse as dates. */
  dateColumns: string[]
}

export async function pythonInput(
  engine: Engine,
  input: PagedResult,
  signal?: AbortSignal,
  cap = PYTHON_ROW_CAP,
): Promise<PythonInput> {
  const sampled = input.rowCount > cap
  const sql = sampled
    ? `SELECT * FROM ${input.relation} USING SAMPLE reservoir(${cap} ROWS) REPEATABLE (42)`
    : `SELECT * FROM ${input.relation}`
  const csv = await exportQuery(engine, sql, 'csv', signal)
  return {
    csv,
    rows: sampled ? cap : input.rowCount,
    sampled,
    dateColumns: input.columns
      .filter((c) => c.logicalType === 'date' || c.logicalType === 'timestamp')
      .map((c) => c.name),
  }
}

let resultCounter = 0

/** Loads Python's `result` (CSV) as a temp table and opens it like any query result. */
export async function loadPythonResult(
  engine: Engine,
  csv: string,
  signal?: AbortSignal,
): Promise<{ table: string; result: PagedResult }> {
  const table = `python_result_${(resultCounter += 1)}`
  const file = `${table}.csv`
  await engine.registerBuffer(file, new TextEncoder().encode(csv))
  try {
    await engine.run(
      `CREATE OR REPLACE TEMP TABLE ${quoteIdent(table)} AS SELECT * FROM read_csv(${quoteLiteral(file)}, header = true, auto_detect = true)`,
      signal,
    )
  } finally {
    await engine.dropFile(file)
  }
  return { table, result: await openQuery(engine, `SELECT * FROM ${quoteIdent(table)}`, signal) }
}

export async function dropPythonResult(engine: Engine, table: string): Promise<void> {
  await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(table)}`)
}
