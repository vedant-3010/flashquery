import type { ColumnProfile, DatasetProfile } from '@/engine/types'

// F-PROF-03: up to 5 starter questions from column roles, no LLM. Templates:
// "Total <measure> by <category>", "<measure> by month", "Top 10 <category> by <measure>", ...

const MAX_SUGGESTIONS = 5
/** Measures worth asking about first, best first. */
const MEASURE_RANK = [/revenue|sales/i, /amount|profit|spend|income|value|total/i, /cost/i]
/** Summing these means nothing ("total unit price"): ask for an average instead. */
const NON_ADDITIVE = /price|rate|ratio|pct|percent|discount|score|age|avg|mean/i

const words = (name: string) => name.replace(/[_\s]+/g, ' ').trim()

/** Naive English plural for column names: product → products, country → countries. */
const plural = (name: string) =>
  /s$/i.test(name) ? name : /[^aeiou]y$/i.test(name) ? `${name.slice(0, -1)}ies` : `${name}s`

function pickMeasure(columns: ColumnProfile[]): ColumnProfile | undefined {
  const measures = columns.filter((column) => column.role === 'measure')
  for (const pattern of MEASURE_RANK) {
    const match = measures.find((column) => pattern.test(column.name))
    if (match) return match
  }
  return measures.find((column) => !NON_ADDITIVE.test(column.name)) ?? measures[0]
}

export function suggestQuestions(datasets: DatasetProfile[]): string[] {
  const out: string[] = []
  const add = (question: string) => {
    if (!out.includes(question) && out.length < MAX_SUGGESTIONS) out.push(question)
  }
  for (const dataset of datasets) {
    const measure = pickMeasure(dataset.columns)
    const categories = dataset.columns.filter(
      (column) =>
        (column.role === 'category' || column.role === 'geo') && column.approxDistinct > 1,
    )
    const time = dataset.columns.find(
      (column) =>
        column.role === 'time' && ['DATE', 'TIMESTAMP'].some((t) => column.type.startsWith(t)),
    )
    const [first, second] = categories
    if (measure && first) {
      const total = NON_ADDITIVE.test(measure.name) ? 'Average' : 'Total'
      add(`${total} ${words(measure.name)} by ${words(first.name)}`)
    }
    if (measure && time)
      add(`${words(measure.name)} by month`.replace(/^./, (c) => c.toUpperCase()))
    if (measure && (second ?? first)) {
      add(`Top 10 ${plural(words((second ?? first)?.name ?? ''))} by ${words(measure.name)}`)
    }
    if (first && !measure) add(`How many rows are there for each ${words(first.name)}?`)
    if (time) add(`How many rows per month?`)
  }
  return out
}
