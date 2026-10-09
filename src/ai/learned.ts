import { keywords, overlap } from '@/ai/keywords'

// Learned examples (F-ASK-20, D112): answers the user confirmed (👍) and SQL they corrected, saved
// as eval cases, become examples for similar questions on the same data. Picked here; rendered (and
// sent in Balanced mode only, since SQL can hold values) by context.ts. Pure.

export interface LearnedExample {
  question: string
  sql: string
}

/** The fields of a saved eval case (src/stores/feedback.ts) that matter here. */
export interface LearnedSource {
  dataset: string
  schemaHash: string | null
  question: string
  referenceSql: string
  generatedSql: string | null
  rating: 'up' | 'down'
  at: number
}

export const MAX_LEARNED = 3

/** A 👍 answer, or a 👎 whose SQL the user corrected; a plain 👎 holds the wrong SQL. */
export function isLearned(source: LearnedSource): boolean {
  return source.rating === 'up' || source.generatedSql !== null
}

/**
 * Up to `count` examples for a question: saved on a table in scope whose columns haven't changed
 * since (same schema hash), nearest by shared keywords, then newest. One per question.
 */
export function pickLearned(
  sources: readonly LearnedSource[],
  {
    question,
    tables,
  }: { question: string; tables: readonly { table: string; schemaHash: string }[] },
  count = MAX_LEARNED,
): LearnedExample[] {
  const hashes = new Map(tables.map((t) => [t.table, t.schemaHash]))
  const asked = keywords(question)
  const seen = new Set<string>()
  return sources
    .filter(
      (source) =>
        isLearned(source) &&
        source.schemaHash !== null &&
        hashes.get(source.dataset) === source.schemaHash,
    )
    .map((source) => ({ source, score: overlap(asked, keywords(source.question)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.source.at - a.source.at)
    .filter(({ source }) => {
      const key = source.question.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, count)
    .map(({ source }) => ({ question: source.question, sql: source.referenceSql }))
}
