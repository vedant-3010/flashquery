// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { totalUsage } from '@/ai/cost'
import { autoEffort } from '@/ai/effort'
import { renderReport, accuracy, type EvalResult, type Outcome } from '@/ai/evalReport'
import { compareResults, hasTopLevelOrderBy, type EvalQuestion } from '@/ai/evals'
import type { AiLogEntry } from '@/ai/log'
import { DEFAULT_MODEL, PROVIDER_LABELS } from '@/ai/models'
import { runPipeline } from '@/ai/pipeline'
import { createProvider, type LLMProvider } from '@/ai/providers'
import { EffortSchema, type RequestEffort } from '@/ai/schemas'
import type { Engine } from '@/engine/connection'
import { runQuery } from '@/engine/query'
import type { DatasetProfile } from '@/engine/types'
import { toAppError } from '@/lib/errors'
import { createTestEngine } from '@/test/duckdb'
import { EVAL_ROWS, loadEvalDatasets, loadQuestions } from '@/test/evalData'

// NL→SQL eval runner (F-QA-04): `ANTHROPIC_API_KEY=… npm run evals`. Runs every question in
// evals/questions.jsonl through the real pipeline (same prompts, guard and self-correction as the
// app, Balanced mode), runs the reference SQL on the same data, compares the results and writes
// evals/report.md. The key comes from the shell environment: the only place an env key is read.
// EVAL_MODEL picks the model; EVAL_EFFORT the effort (low, medium (default, as in the app), high,
// or auto: per question, F-ASK-18); EVAL_ONLY=<id prefix> runs a subset. EVAL_DRY_RUN=1 needs no
// key: a stand-in provider answers with the reference SQL, which checks the harness (expect 100%).

const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
const dryRun = process.env.EVAL_DRY_RUN === '1'
const model = process.env.EVAL_MODEL ?? DEFAULT_MODEL.anthropic
const only = process.env.EVAL_ONLY ?? ''
const effort = EffortSchema.parse(process.env.EVAL_EFFORT ?? 'medium')
const TODAY = '2026-01-15'
const CONCURRENCY = 4
const MAX_ROWS = 10_000

async function evaluate(
  question: EvalQuestion,
  engine: Engine,
  dataset: DatasetProfile,
  provider: LLMProvider,
): Promise<EvalResult> {
  const log: AiLogEntry[] = []
  const started = performance.now()
  const finish = (
    outcome: Outcome,
    reason: string | null,
    sql: string | null,
    attempts: number,
  ) => {
    const usage = totalUsage(log)
    return {
      id: question.id,
      dataset: question.dataset,
      question: question.question,
      outcome,
      reason,
      sql,
      attempts,
      tokens: usage.inputTokens + usage.outputTokens,
      cost: usage.cost,
      ms: performance.now() - started,
    }
  }

  const result = await runPipeline({
    answerId: question.id,
    question: question.question,
    provider,
    engine,
    datasets: [dataset],
    mode: 'balanced',
    history: [],
    locale: 'en-US',
    today: TODAY,
    currency: null,
    signal: AbortSignal.timeout(180_000),
    onLog: (entry) => log.push(entry),
  }).catch((error: unknown) => ({ kind: 'thrown' as const, error: toAppError(error) }))
  const attempts = log.filter(
    (entry) => entry.purpose === 'plan' || entry.purpose === 'repair',
  ).length

  if (result.kind === 'thrown') return finish('model_error', result.error.message, null, attempts)
  if (question.reference_sql === null) {
    return result.kind === 'no-sql'
      ? finish('pass', null, null, attempts)
      : finish(
          'answered_unanswerable',
          `kind ${result.kind}`,
          'sql' in result ? result.sql : null,
          attempts,
        )
  }
  switch (result.kind) {
    case 'no-sql':
      return finish('no_sql', `${result.plan.kind}: ${result.plan.explanation}`, null, attempts)
    case 'python':
      return finish('python', null, result.sql, attempts)
    case 'failed': {
      const { code, message } = result.error
      const outcome: Outcome =
        code === 'guard_rejected'
          ? 'guard_rejected'
          : code.startsWith('ai_') || result.plan === null
            ? 'model_error'
            : 'execution_error'
      return finish(outcome, message, result.sql, attempts)
    }
    case 'answer': {
      const reference = await runQuery(engine, question.reference_sql, { maxRows: MAX_ROWS })
      const generated = await runQuery(engine, result.sql, { maxRows: MAX_ROWS })
      const comparison = compareResults(
        { columns: reference.columns.map((c) => c.name), rows: reference.rows },
        { columns: generated.columns.map((c) => c.name), rows: generated.rows },
        { ordered: hasTopLevelOrderBy(question.reference_sql) },
      )
      return comparison.match
        ? finish('pass', null, result.sql, attempts)
        : finish('wrong_result', comparison.reason, result.sql, attempts)
    }
  }
}

/** Answers each question with its reference SQL: a harness check that needs no key. */
function referenceProvider(questions: readonly EvalQuestion[]): LLMProvider {
  const unavailable = () => Promise.reject(new Error('Not available in a dry run'))
  return {
    id: 'fixture',
    model: 'reference',
    remote: false,
    summaryModel: null,
    async planSql({ question }) {
      const sql = questions.find((q) => q.question === question)?.reference_sql ?? null
      return {
        plan: {
          kind: sql === null ? 'unanswerable' : 'sql',
          title: question,
          sql,
          python: null,
          explanation: 'Reference SQL (dry run).',
          assumptions: [],
          tablesUsed: [],
          columnsUsed: [],
          clarification: null,
          alternatives: [],
          chartHint: null,
        },
        usage: null,
      }
    },
    planDashboard: unavailable,
    testConnection: unavailable,
  }
}

/** Runs `work` over `items`, `limit` at a time, keeping the input order. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const results: R[] = []
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

test.skipIf(apiKey === '' && !dryRun)(
  'NL→SQL execution accuracy',
  async () => {
    const questions = loadQuestions().filter((q) => q.id.startsWith(only))
    const engine = await createTestEngine()
    const datasets = await loadEvalDatasets(engine)
    // One provider per effort; with auto, each question gets the effort the app would pick.
    const providers = new Map<RequestEffort, Promise<LLMProvider>>()
    const providerFor = (question: string): Promise<LLMProvider> => {
      const chosen =
        effort === 'auto' ? autoEffort(question, { tables: 1, hasHistory: false }).effort : effort
      let provider = providers.get(chosen)
      if (!provider) {
        provider = dryRun
          ? Promise.resolve(referenceProvider(questions))
          : createProvider({ provider: 'anthropic', apiKey, model, effort: chosen })
        providers.set(chosen, provider)
      }
      return provider
    }

    const results = await pool(questions, CONCURRENCY, async (question) => {
      const dataset = datasets.get(question.dataset)
      if (!dataset) throw new Error(`Unknown eval dataset ${question.dataset}`)
      const asked = await providerFor(question.question)
      const result = await evaluate(question, engine, dataset, asked)
      console.log(`${result.outcome === 'pass' ? '✓' : '✗'} ${result.id} ${result.reason ?? ''}`)
      return result
    })

    const report = renderReport(results, {
      model: dryRun ? 'reference' : model,
      provider: dryRun ? 'Dry run' : PROVIDER_LABELS.anthropic,
      mode: 'balanced',
      effort,
      rows: EVAL_ROWS,
      date: new Date().toISOString().slice(0, 10),
    })
    if (only === '' && !dryRun) {
      writeFileSync(fileURLToPath(new URL('./report.md', import.meta.url)), report)
    }
    console.log(report.split('\n').slice(0, 5).join('\n'))
    // The milestone bar (PRD §10, M7): at least 85% on the full set.
    if (only === '') expect(accuracy(results)).toBeGreaterThanOrEqual(0.85)
  },
  60 * 60_000,
)
