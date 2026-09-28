import { summarizeChart } from '@/ai/chartSummary'
import type { AnswerSummary } from '@/ai/schemas'
import type { ChartData } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { isIdentifierLike } from '@/engine/roles'
import type { CellValue, ColumnMeta } from '@/engine/types'
import { formatCompact, formatNumber, formatPercent } from '@/lib/format'

// F-ASK-11: the answer's headline written locally, no LLM. Used in strict and demo mode, and until
// the AI summary arrives. Charts are summarized from their spec (chartSummary.ts); tables from the
// result's shape: one row → the value(s); a time column → first vs last; categories → the leader.

export interface SummaryInput {
  columns: ColumnMeta[]
  /** The first rows of the result, in result order. */
  rows: CellValue[][]
  rowCount: number
  locale: string
  /** The chart shown, and its data: when both are given, the summary follows the chart. */
  spec?: ChartSpec
  data?: ChartData
}

const FRACTION = /(pct|percent|share|rate|ratio|margin|growth)/i
const SIGNED = /(growth|change|delta|diff)/i
const TEMPORAL_NAME = /(^|_)(year|yr|month|quarter|week|day|date|period)$/i
const MAX_LABEL = 32

const isNumeric = (column: ColumnMeta) =>
  column.logicalType === 'integer' || column.logicalType === 'number'

function humanize(name: string): string {
  const words = name
    .replace(/_(pct|percent)$/i, '')
    .replace(/[_\s]+/g, ' ')
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function label(value: CellValue, column: ColumnMeta): string {
  if (value === null) return '(blank)'
  let text = String(value)
  if (column.logicalType === 'date' || column.logicalType === 'timestamp') text = text.slice(0, 10)
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text
}

function formatValue(value: number, column: ColumnMeta, locale: string): string {
  if (FRACTION.test(column.name)) {
    const text = formatPercent(value, locale, { maxFractionDigits: Math.abs(value) < 0.1 ? 1 : 0 })
    return SIGNED.test(column.name) && value > 0 ? `+${text}` : text
  }
  if (column.logicalType === 'integer' && Math.abs(value) < 100_000)
    return formatNumber(value, locale)
  return Math.abs(value) >= 10_000 ? formatCompact(value, locale) : formatNumber(value, locale)
}

function change(first: number, last: number, locale: string): string | null {
  if (first === 0) return null
  const ratio = (last - first) / Math.abs(first)
  const text = formatPercent(ratio, locale, { maxFractionDigits: 0 })
  return ratio > 0 ? `+${text}` : text
}

function isTemporal(column: ColumnMeta) {
  return (
    column.logicalType === 'date' ||
    column.logicalType === 'timestamp' ||
    (column.logicalType === 'integer' && TEMPORAL_NAME.test(column.name))
  )
}

export function summarizeLocally(input: SummaryInput): AnswerSummary {
  const { spec, data } = input
  if (spec && data && spec.type !== 'table' && data.rows.length > 0) {
    const summary = summarizeChart(spec, data, input.locale)
    if (summary) return summary
  }
  return summarizeShape(input)
}

function summarizeShape({ columns, rows, rowCount, locale }: SummaryInput): AnswerSummary {
  const caveats: string[] = []
  if (rowCount > rows.length) {
    caveats.push(
      `Summary based on the first ${formatNumber(rows.length, locale)} of ${formatNumber(rowCount, locale)} rows.`,
    )
  }
  if (rows.length === 0) return { headline: 'No rows matched this question.', bullets: [], caveats }

  const measures = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => isNumeric(column) && !isIdentifierLike(column.name))
  const labelColumns = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => !measures.some((m) => m.column === column))
  const measure = measures.at(-1)
  const values = (row: CellValue[]) => (measure ? row[measure.index] : null)

  // One row: report the value(s).
  if (rows.length === 1 && measure) {
    const [row] = rows
    const parts = measures.map(({ column, index }) => {
      const value = row?.[index]
      return `${humanize(column.name)}: ${typeof value === 'number' ? formatValue(value, column, locale) : '—'}`
    })
    const [first, ...rest] = parts
    return { headline: `${first}.`, bullets: rest.slice(0, 3), caveats }
  }

  const labelColumn = labelColumns[0]
  if (!measure || !labelColumn) {
    return { headline: `${formatNumber(rowCount, locale)} rows returned.`, bullets: [], caveats }
  }
  const series = labelColumns.length > 1
  const numeric = rows.filter((row) => typeof values(row) === 'number')
  if (numeric.length === 0) {
    return { headline: `${formatNumber(rowCount, locale)} rows returned.`, bullets: [], caveats }
  }
  const valueOf = (row: CellValue[]) => values(row) as number
  const fmt = (row: CellValue[]) => formatValue(valueOf(row), measure.column, locale)
  const name = (row: CellValue[]) => label(row[labelColumn.index] ?? null, labelColumn.column)
  const byValue = [...numeric].sort((a, b) => valueOf(b) - valueOf(a))
  const top = byValue[0]
  const bottom = byValue.at(-1)
  if (!top || !bottom)
    return { headline: `${formatNumber(rowCount, locale)} rows returned.`, bullets: [], caveats }
  const measureName = humanize(measure.column.name).toLowerCase()

  // A time series (one line): first vs last.
  if (isTemporal(labelColumn.column) && !series) {
    const first = numeric[0]
    const last = numeric.at(-1)
    if (first && last && first !== last) {
      const delta = change(valueOf(first), valueOf(last), locale)
      return {
        headline: `${humanize(measure.column.name)} went from ${fmt(first)} in ${name(first)} to ${fmt(last)} in ${name(last)}${delta ? ` (${delta})` : ''}.`,
        bullets: [
          `Highest: ${fmt(top)} in ${name(top)}.`,
          `Lowest: ${fmt(bottom)} in ${name(bottom)}.`,
        ],
        caveats,
      }
    }
  }

  // Categories: leader and runner-up (or highest vs lowest if the result isn't ranked).
  const second = byValue[1]
  const ranked = numeric[0] === top
  const headline =
    ranked && second
      ? `${name(top)} leads with ${fmt(top)}, followed by ${name(second)} (${fmt(second)}).`
      : `${name(top)} has the highest ${measureName} (${fmt(top)}); ${name(bottom)} the lowest (${fmt(bottom)}).`
  const bullets: string[] = []
  if (!series)
    bullets.push(`${formatNumber(rowCount, locale)} ${rowCount === 1 ? 'row' : 'rows'} compared.`)
  if (ranked && bottom !== top && numeric.length > 2) {
    bullets.push(`Lowest: ${name(bottom)} (${fmt(bottom)}).`)
  }
  if (series)
    caveats.push('The result has several dimensions; the headline looks at the top rows only.')
  return { headline, bullets, caveats }
}
