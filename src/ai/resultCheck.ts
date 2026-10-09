import type { CellValue, ColumnMeta } from '@/engine/types'

// Checks on a result that ran but looks wrong (F-ASK-21, D112): no rows, a column that is NULL in
// every row, or a single row where the question asked for groups. A finding sends the model one
// guided retry. Only counts and column names are described, never values. Pure.

export interface ResultFinding {
  /** What looks wrong ("No rows came back"); no names from the data. */
  problem: string
  /** The columns concerned (untrusted text: the prompt puts them in a <data> block). */
  columns: string[]
  /** What the model should check. */
  hint: string
}

/** For the timeline: "A column is NULL in every row: revenue_2024". */
export function describeFinding(finding: ResultFinding): string {
  return finding.columns.length > 0
    ? `${finding.problem}: ${finding.columns.join(', ')}`
    : finding.problem
}

/** "by region", "per month", "each segment", "across channels", "top 5", "breakdown", "trend". */
const GROUP_INTENT =
  /\b(by|per|each|every|across|breakdown|broken down|split|trend|over time)\b|\btop\s+([2-9]|\d{2,})\b/i

/** A query that asks for one row on purpose. */
const LIMIT_ONE = /\blimit\s+1\b(?!\s*,)/i

export function checkResult({
  question,
  sql,
  columns,
  rows,
  rowCount,
}: {
  question: string
  sql: string
  columns: readonly Pick<ColumnMeta, 'name'>[]
  /** The result's first rows (all of them when rowCount ≤ rows.length). */
  rows: readonly CellValue[][]
  rowCount: number
}): ResultFinding | null {
  if (rowCount === 0) {
    return {
      problem: 'No rows came back',
      columns: [],
      hint: 'Check the filters: exact spellings and case of text values (ILIKE, or explore the distinct values if exploring is allowed), date ranges against the years in the data, and join keys that may not match.',
    }
  }
  // Only when every row is here: a NULL-only first page proves nothing about the rest.
  if (rows.length >= rowCount) {
    const empty = columns
      .filter((_, i) => rows.every((row) => row[i] === null))
      .map((column) => column.name)
    // Lags and changes are NULL on a single row by design.
    if (empty.length > 0 && rowCount > 1) {
      return {
        problem: `${empty.length === 1 ? 'A column is' : 'Some columns are'} NULL in every row`,
        columns: empty,
        hint: 'Check casts (TRY_CAST gives NULL when the text is not a number or date), the column names used, CASE branches, and joins that match no rows.',
      }
    }
    if (empty.length > 0 && empty.length === columns.length) {
      return {
        problem: 'The only row is entirely NULL',
        columns: [],
        hint: 'An aggregate over no matching rows gives NULL: check the filters, spellings and date ranges.',
      }
    }
  }
  if (rowCount === 1 && GROUP_INTENT.test(question) && !LIMIT_ONE.test(sql)) {
    return {
      problem: 'One row came back, but the question asks for a breakdown',
      columns: [],
      hint: 'Check the GROUP BY (it should include the grouping column, and the column should be selected) and any filter that keeps a single group.',
    }
  }
  return null
}
