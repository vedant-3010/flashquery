import { z } from '@/lib/zod'
import { create } from 'zustand'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { backupCorruptRecord } from '@/stores/persistence'

// Feedback (F-ASK-14): 👍/👎 per answer (this session only) and eval cases saved from answers,
// kept in IndexedDB and exported as JSON Lines in the evals/ format (evals/questions.jsonl).
// A 👍 saves its answer as a case, and 👍 and corrected cases guide similar questions on the same
// data (learned examples, F-ASK-20, src/ai/learned.ts).

export const PROBLEMS = {
  numbers: 'Wrong numbers',
  columns: 'Wrong columns or table',
  question: 'Misunderstood the question',
  chart: 'Unhelpful chart',
  other: 'Something else',
} as const
export type Problem = keyof typeof PROBLEMS

export const EvalCaseSchema = z.object({
  id: z.string(),
  /** The table the question was asked about (the evals `dataset`). */
  dataset: z.string(),
  fileName: z.string().nullable(),
  schemaHash: z.string().nullable(),
  question: z.string(),
  /** The SQL that gives the right answer (the AI's, or the user's correction). */
  referenceSql: z.string(),
  /** The AI's SQL when the user corrected it. */
  generatedSql: z.string().nullable(),
  rating: z.enum(['up', 'down']),
  problem: z.enum(Object.keys(PROBLEMS) as [Problem, ...Problem[]]).nullable(),
  notes: z.string().nullable(),
  at: z.number(),
})
export type EvalCase = z.infer<typeof EvalCaseSchema>

export const EVAL_CASES_RECORD: RecordSpec<EvalCase[]> = {
  key: 'evalCases',
  version: 1,
  schema: z.array(EvalCaseSchema),
  fallback: () => [],
}

const MAX_CASES = 500

/** One line per case, the evals/questions.jsonl shape plus where the case came from. */
export function toJsonl(cases: readonly EvalCase[]): string {
  return cases
    .map((c) =>
      JSON.stringify({
        id: c.id,
        dataset: c.dataset,
        question: c.question,
        reference_sql: c.referenceSql,
        notes: [c.problem && PROBLEMS[c.problem], c.notes].filter(Boolean).join(': ') || null,
        source: {
          app: 'flashQuery',
          fileName: c.fileName,
          schemaHash: c.schemaHash,
          rating: c.rating,
        },
        generated_sql: c.generatedSql,
      }),
    )
    .join('\n')
}

interface FeedbackState {
  /** Ratings by answer id (session only). */
  ratings: Record<string, 'up' | 'down'>
  /** The case each 👍 saved, by answer id (this session), so taking the 👍 back removes it. */
  liked: Record<string, string>
  cases: EvalCase[]
  hydrated: boolean
  rate: (answerId: string, rating: 'up' | 'down' | null) => void
  /** 👍: rates the answer and saves it as a case (null: nothing to save, e.g. no SQL). */
  like: (answerId: string, input: Omit<EvalCase, 'id' | 'at'> | null) => void
  /** Takes a 👍 back, with the case it saved. */
  unlike: (answerId: string) => void
  saveCase: (input: Omit<EvalCase, 'id' | 'at'>) => EvalCase
  removeCase: (id: string) => void
  clearCases: () => void
  hydrate: () => Promise<void>
}

export const useFeedbackStore = create<FeedbackState>()((set, get) => ({
  ratings: {},
  liked: {},
  cases: [],
  hydrated: false,
  rate: (answerId, rating) =>
    set((state) => {
      const ratings = { ...state.ratings }
      if (rating) ratings[answerId] = rating
      else delete ratings[answerId]
      return { ratings }
    }),
  like: (answerId, input) => {
    const saved = input ? get().saveCase(input) : null
    set((state) => ({
      ratings: { ...state.ratings, [answerId]: 'up' },
      liked: saved ? { ...state.liked, [answerId]: saved.id } : state.liked,
    }))
  },
  unlike: (answerId) =>
    set((state) => {
      const caseId = state.liked[answerId]
      const ratings = { ...state.ratings }
      const liked = { ...state.liked }
      delete ratings[answerId]
      delete liked[answerId]
      return {
        ratings,
        liked,
        cases: caseId ? state.cases.filter((c) => c.id !== caseId) : state.cases,
      }
    }),
  saveCase: (input) => {
    const saved: EvalCase = { ...input, id: `case-${crypto.randomUUID()}`, at: Date.now() }
    set((state) => ({ cases: [saved, ...state.cases].slice(0, MAX_CASES) }))
    return saved
  },
  removeCase: (id) => set((state) => ({ cases: state.cases.filter((c) => c.id !== id) })),
  clearCases: () => set({ cases: [], liked: {} }),
  hydrate: () => (hydrating ??= load()),
}))

let hydrating: Promise<void> | null = null

async function load() {
  const saved = await loadRecord(EVAL_CASES_RECORD, { onCorrupt: backupCorruptRecord }).catch(
    (error: unknown) => {
      console.warn('flashQuery: eval cases could not be loaded', error)
      return []
    },
  )
  useFeedbackStore.setState((state) => ({ cases: [...state.cases, ...saved], hydrated: true }))
  useFeedbackStore.subscribe((state, previous) => {
    if (state.cases === previous.cases) return
    saveRecord(EVAL_CASES_RECORD, state.cases).catch((error: unknown) =>
      console.warn('flashQuery: eval cases could not be saved', error),
    )
  })
}
