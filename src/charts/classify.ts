import { isIdentifierLike } from '@/engine/roles'
import type { CellValue, ColumnMeta } from '@/engine/types'
import type { ValueStyle } from '@/lib/format'

// Column classes for chart choice (docs/PRD.md §6), read from a query result's columns and its
// first rows: temporal (dates, or years by name), measure (numbers that aren't ids), category
// (labels: text, booleans, id-like or numbered keys) and text (long free text). Pure.

export type ColumnKind = 'temporal' | 'measure' | 'category' | 'text'

export interface ColumnInfo {
  index: number
  name: string
  meta: ColumnMeta
  kind: ColumnKind
  /** Distinct non-null values among the rows seen. */
  distinct: number
  /** Every row seen has its own, non-null value. */
  unique: boolean
  /** Keep the result's order (time, numbered buckets, month or weekday names), don't sort by value. */
  ordinal: boolean
  /** Longest value, in characters (labels). */
  maxLength: number
  /** Measures: no negative values. */
  nonNegative: boolean
  /** Largest absolute value (measures). */
  magnitude: number
  /** Temporal: dates/timestamps on a time axis (false for years, which are labels). */
  continuousTime: boolean
}

export interface ResultShape {
  columns: ColumnInfo[]
  /** Rows the whole result has. */
  rowCount: number
  /** The rows classified: the first ones of the result. */
  rows: CellValue[][]
  /** `rows` is the whole result. */
  complete: boolean
  temporal: ColumnInfo[]
  measures: ColumnInfo[]
  categories: ColumnInfo[]
  text: ColumnInfo[]
}

const YEAR_NAME = /(^|_)(year|yr|fiscal_year|fy)$/i
const ISO_TEMPORAL = /^\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?)?$/
const MONTH_NAMES =
  /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)$/i
const WEEKDAY_NAMES =
  /^(mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(r(s(day)?)?)?|fri(day)?|sat(urday)?|sun(day)?)$/i
const QUARTER = /^(\d{4}[-\s]?)?q[1-4]$/i
/** Numbered buckets: "0-10", "<18", "10+", "1. Low". */
const BUCKET = /^[<>≤≥~]?\s*[-+]?\d/
/** Longer than this and a text column is prose, not a label. */
const TEXT_HEAVY = 60

/** Values that are fractions of 1 when the name says so ("growth_pct" 0.42 → 42%). */
const FRACTION_NAME = /(pct|percent|share|growth|margin|proportion)/i
const RATE_NAME = /rate/i
const MONEY_NAME =
  /(revenue|sales|price|cost|profit|amount|spend|income|order_value|aov|salary|wage|budget|fee|payment|gmv|arpu|ltv)/i
/** Summing these is meaningless: they're averages, rates or extremes. */
const NON_ADDITIVE =
  /((^|_)(avg|average|mean|median|min|max|std|stddev)(_|$)|rate|ratio|pct|percent|margin|growth|price|score)/i

/** Whether values of this measure can be summed (into a stack, a total or "Other"). */
export const isAdditiveName = (name: string) => !NON_ADDITIVE.test(name)
export const isAdditive = (column: ColumnInfo) => isAdditiveName(column.name)

function kindOf(meta: ColumnMeta, values: CellValue[]): ColumnKind {
  switch (meta.logicalType) {
    case 'date':
    case 'timestamp':
      return 'temporal'
    case 'integer':
    case 'number': {
      const years = values.every(
        (value) =>
          typeof value === 'number' && Number.isInteger(value) && value > 1800 && value < 2200,
      )
      if (YEAR_NAME.test(meta.name) && years) return 'temporal'
      return isIdentifierLike(meta.name) ? 'category' : 'measure'
    }
    case 'boolean':
      return 'category'
    case 'text': {
      const strings = values.filter((value): value is string => typeof value === 'string')
      if (strings.length > 0 && strings.every((value) => ISO_TEMPORAL.test(value)))
        return 'temporal'
      return strings.some((value) => value.length > TEXT_HEAVY) ? 'text' : 'category'
    }
    case 'other':
      return 'text'
  }
}

function isOrdinalText(values: string[]): boolean {
  if (values.length === 0) return false
  return [MONTH_NAMES, WEEKDAY_NAMES, QUARTER, BUCKET].some((pattern) =>
    values.every((value) => pattern.test(value.trim())),
  )
}

function describe(meta: ColumnMeta, index: number, rows: CellValue[][]): ColumnInfo {
  const values = rows.map((row) => row[index] ?? null)
  const present = values.filter((value) => value !== null)
  const distinct = new Set(present.map((value) => String(value))).size
  const kind = kindOf(meta, present)
  const numbers = present.filter((value): value is number => typeof value === 'number')
  const strings = present.map((value) => String(value))
  return {
    index,
    name: meta.name,
    meta,
    kind,
    distinct,
    unique: present.length === rows.length && distinct === rows.length,
    ordinal:
      kind === 'temporal' ||
      (kind === 'category' && meta.logicalType === 'integer') ||
      (kind === 'category' && meta.logicalType === 'text' && isOrdinalText(strings)),
    maxLength: strings.reduce((max, value) => Math.max(max, value.length), 0),
    nonNegative: numbers.every((value) => value >= 0),
    magnitude: numbers.reduce((max, value) => Math.max(max, Math.abs(value)), 0),
    continuousTime: kind === 'temporal' && meta.logicalType !== 'integer',
  }
}

/** Classifies a result from its first rows (all of them when the result is small). */
export function analyze(columns: ColumnMeta[], rows: CellValue[][], rowCount: number): ResultShape {
  const infos = columns.map((meta, index) => describe(meta, index, rows))
  const complete = rows.length >= rowCount

  // A leading whole-number key ("units", "rating") with a value per row labels the other numbers.
  const [first] = infos
  const measureCount = infos.filter((info) => info.kind === 'measure').length
  if (
    first?.kind === 'measure' &&
    first.meta.logicalType === 'integer' &&
    first.unique &&
    first.distinct <= 30 &&
    measureCount >= 2
  ) {
    first.kind = 'category'
    first.ordinal = true
  }

  const of = (kind: ColumnKind) => infos.filter((info) => info.kind === kind)
  return {
    columns: infos,
    rowCount,
    rows,
    complete,
    temporal: of('temporal'),
    measures: of('measure'),
    categories: of('category'),
    text: of('text'),
  }
}

/** Whether no two rows seen share the same (a, b) pair. */
export function pairsUnique(shape: ResultShape, a: ColumnInfo, b: ColumnInfo): boolean {
  const seen = new Set<string>()
  for (const row of shape.rows) {
    const key = JSON.stringify([row[a.index] ?? null, row[b.index] ?? null])
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

/** How a measure's values read: percent for fractions, currency for money when one is set. */
export function valueStyle(
  column: ColumnInfo | undefined,
  shape: ResultShape,
  currency: string | null,
): ValueStyle {
  if (!column) return { y: 'number', currency: null }
  const values = shape.rows
    .map((row) => row[column.index])
    .filter((value): value is number => typeof value === 'number')
  const within = (limit: number) => values.every((value) => Math.abs(value) <= limit)
  if (
    (FRACTION_NAME.test(column.name) && within(10)) ||
    (RATE_NAME.test(column.name) && within(1))
  ) {
    return { y: 'percent', currency: null }
  }
  if (currency && MONEY_NAME.test(column.name)) return { y: 'currency', currency }
  return { y: 'number', currency: null }
}
