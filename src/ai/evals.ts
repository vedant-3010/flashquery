import { z } from '@/lib/zod'
import type { CellValue } from '@/engine/types'

// NL→SQL evals (F-QA-04): the question set and how a generated result is compared with the
// reference one. Execution accuracy, relaxed the usual way: column names and column order don't
// matter, extra columns are allowed, numbers match within 1e-6 (relative) or when one side is the
// other rounded to 1–4 decimals, and row order matters only when the reference has a top-level
// ORDER BY. Pure; the runner is evals/run.eval.ts.

export const EvalQuestionSchema = z.object({
  id: z.string(),
  dataset: z.string(),
  question: z.string(),
  /** null: the schema can't answer it; the model should say so (kind 'unanswerable'). */
  reference_sql: z.string().nullable(),
  notes: z.string().nullable(),
})
export type EvalQuestion = z.infer<typeof EvalQuestionSchema>

export function parseQuestions(jsonl: string): EvalQuestion[] {
  const questions = jsonl
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line, index) => {
      try {
        return EvalQuestionSchema.parse(JSON.parse(line))
      } catch (error) {
        throw new Error(`questions.jsonl line ${index + 1}: ${String(error)}`, { cause: error })
      }
    })
  const ids = new Set<string>()
  for (const question of questions) {
    if (ids.has(question.id)) throw new Error(`Duplicate eval id ${question.id}`)
    ids.add(question.id)
  }
  return questions
}

export interface ResultTable {
  columns: string[]
  rows: CellValue[][]
}

/** True when the outermost query sorts its rows (ORDER BY outside any parentheses). */
export function hasTopLevelOrderBy(sql: string): boolean {
  let depth = 0
  let outer = ''
  for (const char of sql.replace(/'(?:[^']|'')*'/g, "''")) {
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (depth === 0) outer += char
  }
  return /\border\s+by\b/i.test(outer)
}

const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})[T ]00:00:00(?:\.0+)?Z?$/
const YEAR_MONTH = /^\d{4}-\d{2}$/

/** Midnight timestamps compare as dates, and a "2024-03" month label as its first day. */
function normalize(value: CellValue): CellValue {
  if (typeof value !== 'string') return value
  if (YEAR_MONTH.test(value)) return `${value}-01`
  return MIDNIGHT.exec(value)?.[1] ?? value
}

function sameNumber(a: number, b: number): boolean {
  if (a === b) return true
  if (Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b), 1e-9)) return true
  for (let digits = 1; digits <= 4; digits += 1) {
    const scale = 10 ** digits
    if (Math.round(a * scale) / scale === b || Math.round(b * scale) / scale === a) return true
  }
  return false
}

export function sameValue(a: CellValue, b: CellValue): boolean {
  const x = normalize(a)
  const y = normalize(b)
  if (typeof x === 'number' && typeof y === 'number') return sameNumber(x, y)
  return x === y
}

/** A sort key that keeps values close enough to compare equal next to each other. */
function sortKey(value: CellValue): string {
  const v = normalize(value)
  if (v === null) return '0'
  if (typeof v === 'number') return `1${v.toPrecision(5)}`
  return `2${String(v)}`
}

const column = (table: ResultTable, index: number) => table.rows.map((row) => row[index] ?? null)

function sameSequence(a: CellValue[], b: CellValue[]) {
  return a.length === b.length && a.every((value, i) => sameValue(value, b[i] ?? null))
}

function sortedValues(values: CellValue[]) {
  return values
    .map((value) => [sortKey(value), value] as const)
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([, value]) => value)
}

/** Maps each reference column to a distinct generated column (backtracking; results are small). */
function mapColumns(
  reference: ResultTable,
  generated: ResultTable,
  fits: (ref: number, got: number) => boolean,
): number[] | null {
  const candidates = reference.columns.map((_, ref) =>
    generated.columns.map((_, got) => got).filter((got) => fits(ref, got)),
  )
  const used = new Set<number>()
  const mapping: number[] = []
  const assign = (ref: number): boolean => {
    if (ref === candidates.length) return true
    for (const got of candidates[ref] ?? []) {
      if (used.has(got)) continue
      used.add(got)
      mapping[ref] = got
      if (assign(ref + 1)) return true
      used.delete(got)
    }
    return false
  }
  return assign(0) ? mapping : null
}

function rowsKey(row: CellValue[]) {
  return row.map(sortKey).join('\u0001')
}

export type Comparison = { match: true } | { match: false; reason: string }

export function compareResults(
  reference: ResultTable,
  generated: ResultTable,
  { ordered }: { ordered: boolean },
): Comparison {
  if (reference.rows.length !== generated.rows.length) {
    return {
      match: false,
      reason: `${generated.rows.length} rows, expected ${reference.rows.length}`,
    }
  }
  const sameColumn = ordered
    ? (ref: number, got: number) => sameSequence(column(reference, ref), column(generated, got))
    : (ref: number, got: number) =>
        sameSequence(sortedValues(column(reference, ref)), sortedValues(column(generated, got)))
  const mapping = mapColumns(reference, generated, sameColumn)
  if (!mapping) {
    const missing = reference.columns.filter(
      (_, ref) => !generated.columns.some((__, got) => sameColumn(ref, got)),
    )
    return {
      match: false,
      reason: missing.length
        ? `no column matches ${missing.map((name) => `"${name}"`).join(', ')}`
        : 'columns match only in combinations that conflict',
    }
  }
  if (ordered) return { match: true }

  // Columns match one by one; the rows must also match as whole rows.
  const project = (row: CellValue[]) => mapping.map((got) => row[got] ?? null)
  const a = [...reference.rows].sort((x, y) => (rowsKey(x) < rowsKey(y) ? -1 : 1))
  const b = generated.rows.map(project).sort((x, y) => (rowsKey(x) < rowsKey(y) ? -1 : 1))
  const same = a.every((row, i) => sameSequence(row, b[i] ?? []))
  return same ? { match: true } : { match: false, reason: 'the same values, in different rows' }
}
