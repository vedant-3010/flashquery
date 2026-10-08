import { buildContext, countDataValues, fetchSamples } from '@/ai/context'
import type { AiLogEntry } from '@/ai/log'
import { buildSuggestMessages } from '@/ai/prompts/suggest'
import type { LLMProvider } from '@/ai/providers'
import type { SqlRunner } from '@/engine/connection'
import type { DatasetProfile } from '@/engine/types'
import { AppError, toAppError } from '@/lib/errors'

// LLM-suggested questions (F-PROF-04): Balanced mode only, on the user's request; the caller caches
// them per schema (suggestionKey). Logged to the AI inspector like every other request.

const MAX_QUESTIONS = 6
const TIMEOUT_MS = 60_000

/** The cache key: the tables' schemas, order-independent. */
export function suggestionKey(datasets: readonly DatasetProfile[]): string {
  return datasets
    .map((dataset) => dataset.schemaHash)
    .sort()
    .join('+')
}

/** Trims, de-duplicates and caps the model's questions. */
export function cleanQuestions(questions: readonly string[]): string[] {
  const seen = new Set<string>()
  const clean: string[] = []
  for (const raw of questions) {
    const question = raw.trim().replace(/\s+/g, ' ').slice(0, 120)
    const key = question.toLowerCase()
    if (question === '' || seen.has(key)) continue
    seen.add(key)
    clean.push(question)
  }
  return clean.slice(0, MAX_QUESTIONS)
}

export async function suggestWithAi({
  provider,
  runner,
  datasets,
  signal,
  onLog,
}: {
  provider: LLMProvider
  runner: SqlRunner
  datasets: DatasetProfile[]
  signal: AbortSignal
  onLog?: (entry: AiLogEntry) => void
}): Promise<string[]> {
  if (!provider.suggestQuestions || !provider.summaryModel) {
    throw new AppError({
      code: 'no_summary',
      message: 'AI suggestions need an API key.',
      detail: null,
    })
  }
  const tables = datasets.map((dataset) => dataset.table)
  const samples = await fetchSamples(runner, tables, signal)
  const context = buildContext({ datasets, mode: 'balanced', samples })
  const messages = buildSuggestMessages(context)
  const started = performance.now()
  const log = (output: unknown, error: string | null, usage: AiLogEntry['usage']) =>
    onLog?.({
      id: `log_suggest_${Date.now().toString(36)}`,
      answerId: 'suggest',
      purpose: 'suggest',
      provider: provider.id,
      model: provider.summaryModel ?? provider.model,
      effort: provider.summaryEffort ?? null,
      mode: 'balanced',
      dataValues: countDataValues(context),
      messages: messages.map(({ role, content }) => ({ role, content })),
      output,
      error,
      usage,
      ms: performance.now() - started,
      at: Date.now(),
    })
  try {
    const response = await provider.suggestQuestions({
      messages,
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    })
    log({ questions: response.questions }, null, response.usage)
    return cleanQuestions(response.questions)
  } catch (error) {
    log(null, toAppError(error).message, null)
    throw error
  }
}
