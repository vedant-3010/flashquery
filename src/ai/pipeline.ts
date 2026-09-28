import {
  buildContext,
  countDataValues,
  countResultValues,
  fetchResultDigest,
  fetchSamples,
  type AiContext,
} from '@/ai/context'
import type { AiLogEntry } from '@/ai/log'
import {
  buildPlanMessages,
  buildRepairMessages,
  type PromptMessage,
  type Turn,
} from '@/ai/prompts/planSql'
import { buildSummaryMessages } from '@/ai/prompts/summarize'
import type { LLMProvider, PlanResponse } from '@/ai/providers'
import type { AnswerSummary, ChartHint, PrivacyMode, SqlPlan } from '@/ai/schemas'
import { summarizeLocally } from '@/ai/summary'
import { Trace, type TraceStep } from '@/ai/trace'
import { selectChart } from '@/charts/select'
import type { ChartData } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { loadChartData, readChartRows } from '@/engine/chartData'
import type { Engine } from '@/engine/connection'
import { openQuery, type PagedResult } from '@/engine/paging'
import { DEFAULT_TIMEOUT_MS } from '@/engine/query'
import { guardSql } from '@/engine/sqlGuard'
import type { CellValue, DatasetProfile } from '@/engine/types'
import { AppError, isCancellation, toAppError, type AppErrorData } from '@/lib/errors'

// The ask pipeline (F-ASK-02…11), in a fixed order that never skips the checks:
// context → plan (LLM) → guard → EXPLAIN → execute → chart → local summary, and on a failure in
// guard/explain/execute the error goes back to the model for a corrected plan, at most twice
// (F-ASK-05). In Balanced mode the AI summary (narrate, F-ASK-12) follows once the answer is shown.

export const MAX_ATTEMPTS = 3
const LLM_TIMEOUT_MS = 120_000

export interface PipelineInput {
  answerId: string
  question: string
  provider: LLMProvider
  engine: Engine
  /** Tables in scope. */
  datasets: DatasetProfile[]
  mode: PrivacyMode
  history: Turn[]
  locale: string
  /** YYYY-MM-DD */
  today: string
  /** Currency for money columns in charts (settings), or null. */
  currency: string | null
  signal: AbortSignal
  onTrace?: (steps: TraceStep[]) => void
  onLog?: (entry: AiLogEntry) => void
}

export interface AnswerChart {
  spec: ChartSpec
  data: ChartData
  /** What selectChart chose; the switcher can go back to it. */
  auto: ChartSpec
}

/** What chart choice knows beyond the result: the question, the AI's hint, the title, currency. */
export interface ChartContext {
  question?: string
  hint?: ChartHint | null
  title?: string
  currency?: string | null
}

export interface SqlResult {
  sql: string
  result: PagedResult
  /** The result's first rows (all of them up to 5,000): chart choice and the local summary. */
  rows: CellValue[][]
  chart: AnswerChart
  summary: AnswerSummary
}

export type PipelineOutcome =
  | ({ kind: 'answer'; plan: SqlPlan; trace: TraceStep[] } & SqlResult)
  /** The model answered without SQL: unanswerable, clarify, or python (runs from M6). */
  | { kind: 'no-sql'; plan: SqlPlan; trace: TraceStep[] }
  | {
      kind: 'failed'
      plan: SqlPlan | null
      /** The last SQL tried, for the user to edit (F-ASK-05). */
      sql: string | null
      error: AppErrorData
      trace: TraceStep[]
    }

let logCounter = 0

function describeFailure(error: AppError): string {
  const detail = error.code === 'guard_rejected' ? null : error.detail
  const text = detail && detail !== error.message ? `${error.message}\n${detail}` : error.message
  return text.slice(0, 2_000)
}

async function plan(
  input: PipelineInput,
  context: AiContext,
  messages: PromptMessage[],
  purpose: 'plan' | 'repair',
): Promise<PlanResponse> {
  const { provider, signal } = input
  const call = async (): Promise<PlanResponse> => {
    const started = performance.now()
    const log = (output: unknown, error: string | null, usage: PlanResponse['usage']) => {
      if (!provider.remote) return
      input.onLog?.({
        id: `log_${Date.now().toString(36)}_${(logCounter += 1)}`,
        answerId: input.answerId,
        purpose,
        provider: provider.id,
        model: provider.model,
        mode: input.mode,
        dataValues: countDataValues(context),
        messages: messages.map(({ role, content }) => ({ role, content })),
        output,
        error,
        usage,
        ms: performance.now() - started,
        at: Date.now(),
      })
    }
    try {
      const response = await provider.planSql({
        question: input.question,
        messages,
        tables: input.datasets.map((dataset) => dataset.table),
        signal: AbortSignal.any([signal, AbortSignal.timeout(LLM_TIMEOUT_MS)]),
      })
      log(response.plan, null, response.usage)
      return response
    } catch (error) {
      log(null, toAppError(error).message, null)
      throw error
    }
  }
  try {
    return await call()
  } catch (error) {
    // One retry when the reply didn't match the schema (ai.md: "one repair retry on parse failure").
    if (error instanceof AppError && error.code === 'ai_bad_output') return call()
    throw error
  }
}

/** Picks the chart and reads its data; a chart that can't be drawn falls back to the table. */
async function chooseChart(
  engine: Engine,
  result: PagedResult,
  context: ChartContext,
  signal: AbortSignal,
): Promise<{ rows: CellValue[][]; chart: AnswerChart }> {
  const rows = await readChartRows(engine, result, signal)
  const spec = selectChart({
    columns: result.columns,
    rows,
    rowCount: result.rowCount,
    ...context,
  })
  try {
    const data = await loadChartData(engine, result, spec, rows, signal)
    return { rows, chart: { spec, data, auto: spec } }
  } catch (error) {
    if (isCancellation(error)) throw error
    const table: ChartSpec = {
      ...spec,
      type: 'table',
      reason: `The chart couldn't be drawn (${toAppError(error).message}), so the table shows the result.`,
    }
    const data: ChartData = {
      columns: result.columns,
      rows,
      rowCount: result.rowCount,
      sampling: rows.length >= result.rowCount ? 'none' : 'head',
    }
    return { rows, chart: { spec: table, data, auto: table } }
  }
}

/** Guard → EXPLAIN → execute → chart → local summary. Also runs SQL edited in the answer card. */
export async function executeSql(
  sql: string,
  {
    engine,
    tables,
    locale,
    signal,
    trace,
    attempt = 1,
    chartContext = {},
  }: {
    engine: Engine
    tables: string[]
    locale: string
    signal: AbortSignal
    trace: Trace
    attempt?: number
    chartContext?: ChartContext
  },
): Promise<SqlResult> {
  const checked = await trace.step(
    'guard',
    attempt,
    () => guardSql(engine, sql, { tables, signal }),
    sql,
  )
  await trace.step('explain', attempt, () => engine.run(`EXPLAIN ${checked}`, signal), checked)
  const runSignal = AbortSignal.any([signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
  const result = await trace.step(
    'execute',
    attempt,
    () => openQuery(engine, checked, runSignal),
    checked,
  )
  const { rows, chart } = await trace.step('chart', attempt, () =>
    chooseChart(engine, result, chartContext, runSignal),
  )
  const summary = await trace.step('summary', attempt, async () =>
    summarizeLocally({
      columns: result.columns,
      rows,
      rowCount: result.rowCount,
      locale,
      spec: chart.spec,
      data: chart.data,
    }),
  )
  return { sql: checked, result, rows, chart, summary }
}

export interface NarrateInput {
  answerId: string
  question: string
  plan: SqlPlan | null
  sql: string
  result: PagedResult
  rows: CellValue[][]
  spec: ChartSpec
  provider: LLMProvider
  engine: Engine
  mode: PrivacyMode
  signal: AbortSignal
  trace: Trace
  onLog?: (entry: AiLogEntry) => void
}

/** Whether the AI writes the summary: Balanced mode with a real provider (F-ASK-12). */
export function canNarrate(provider: LLMProvider, mode: PrivacyMode): boolean {
  return mode === 'balanced' && provider.remote && provider.summarize !== undefined
}

/**
 * The AI summary of an answer (F-ASK-12): the result (≤ 50 rows, else a digest; context.ts) goes to
 * the provider's fast model. Strict mode never gets here, and context.ts refuses it anyway.
 */
export async function narrate(
  input: NarrateInput,
): Promise<{ summary: AnswerSummary; model: string }> {
  const { provider, mode } = input
  const model = provider.summaryModel
  if (!canNarrate(provider, mode) || !provider.summarize || !model) {
    throw new AppError({
      code: 'no_summary',
      message: 'AI summaries need Balanced mode and an API key.',
      detail: null,
    })
  }
  const summarize = provider.summarize
  return input.trace.step('narrate', 1, async (step) => {
    const digest = await fetchResultDigest(
      input.engine,
      { mode, result: input.result, rows: input.rows, measure: input.spec.y[0] ?? null },
      input.signal,
    )
    const messages = buildSummaryMessages({
      question: input.question,
      title: input.plan?.title ?? input.question,
      sql: input.sql,
      assumptions: input.plan?.assumptions ?? [],
      spec: input.spec,
      digest,
    })
    const started = performance.now()
    const log = (output: unknown, error: string | null, usage: AiLogEntry['usage']) =>
      input.onLog?.({
        id: `log_${Date.now().toString(36)}_${(logCounter += 1)}`,
        answerId: input.answerId,
        purpose: 'summary',
        provider: provider.id,
        model,
        mode,
        dataValues: countResultValues(digest),
        messages: messages.map(({ role, content }) => ({ role, content })),
        output,
        error,
        usage,
        ms: performance.now() - started,
        at: Date.now(),
      })
    try {
      const response = await summarize({
        messages,
        signal: AbortSignal.any([input.signal, AbortSignal.timeout(LLM_TIMEOUT_MS)]),
      })
      log(response.summary, null, response.usage)
      step.usage = response.usage
      return { summary: response.summary, model }
    } catch (error) {
      log(null, toAppError(error).message, null)
      throw error
    }
  })
}

export async function runPipeline(input: PipelineInput): Promise<PipelineOutcome> {
  const { engine, datasets, mode, signal, provider } = input
  const trace = new Trace(input.onTrace)
  const tables = datasets.map((dataset) => dataset.table)

  const context = await trace.step('context', 1, async () => {
    // Sample rows are fetched only when they may be sent: balanced mode, remote provider.
    const samples =
      mode === 'balanced' && provider.remote
        ? await fetchSamples(engine, tables, signal)
        : undefined
    return buildContext({ datasets, mode, samples })
  })

  let messages = buildPlanMessages({
    context,
    question: input.question,
    history: input.history,
    today: input.today,
  })
  let current: SqlPlan | null = null
  let lastSql: string | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await trace.step('plan', attempt, async (step) => {
        const planned = await plan(input, context, messages, attempt === 1 ? 'plan' : 'repair')
        step.usage = planned.usage
        step.sql = planned.plan.sql
        return planned
      })
      current = response.plan
    } catch (error) {
      if (isCancellation(error)) throw error
      return {
        kind: 'failed',
        plan: current,
        sql: lastSql,
        error: toAppError(error).toJSON(),
        trace: trace.steps,
      }
    }

    if (current.kind !== 'sql') return { kind: 'no-sql', plan: current, trace: trace.steps }
    lastSql = current.sql ?? ''
    try {
      const executed = await executeSql(lastSql, {
        engine,
        tables,
        locale: input.locale,
        signal,
        trace,
        attempt,
        chartContext: {
          question: input.question,
          hint: current.chartHint,
          title: current.title,
          currency: input.currency,
        },
      })
      return { kind: 'answer', plan: current, trace: trace.steps, ...executed }
    } catch (error) {
      if (isCancellation(error)) throw error
      const failure = toAppError(error)
      if (attempt === MAX_ATTEMPTS) {
        return {
          kind: 'failed',
          plan: current,
          sql: lastSql,
          error: failure.toJSON(),
          trace: trace.steps,
        }
      }
      messages = buildRepairMessages(messages, current, describeFailure(failure))
    }
  }
  // Unreachable: the loop returns on its last attempt.
  throw new AppError({
    code: 'pipeline',
    message: 'The question could not be answered.',
    detail: null,
  })
}
