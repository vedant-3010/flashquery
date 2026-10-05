import {
  buildContext,
  countDataValues,
  countResultValues,
  fetchResultDigest,
  fetchSamples,
} from '@/ai/context'
import type { AiLogEntry } from '@/ai/log'
import {
  describeExploration,
  explorationValues,
  exploreQuery,
  MAX_EXPLORATIONS,
} from '@/ai/explore'
import {
  buildExploreMessages,
  buildNoExploreMessages,
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
import type { Relationship } from '@/engine/relationships'
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
  /** Join keys between them (F-PROF-07), already without the ones the user dismissed. */
  relationships?: readonly Relationship[]
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
  /** The model answered without SQL: unanswerable or clarify. */
  | { kind: 'no-sql'; plan: SqlPlan; trace: TraceStep[] }
  /**
   * A Python plan (F-PY-01): its input query ran; the code waits for the user's approval.
   * `messages` are kept for one AI fix if the code fails (F-PY-04).
   */
  | {
      kind: 'python'
      plan: SqlPlan
      sql: string
      input: PagedResult
      messages: PromptMessage[]
      trace: TraceStep[]
    }
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

/** What one planning call needs (the first plan, a repair, or a Python fix). */
export interface PlanCall {
  provider: LLMProvider
  answerId: string
  question: string
  mode: PrivacyMode
  tables: string[]
  /** Values from the data in the messages, for the inspector. */
  dataValues: number
  signal: AbortSignal
  onLog?: (entry: AiLogEntry) => void
}

export async function planCall(
  input: PlanCall,
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
        dataValues: input.dataValues,
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
        tables: input.tables,
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
export async function chooseChart(
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

/** Guard → EXPLAIN → execute (as a paged temp view). Every query the AI writes goes through here. */
export async function openChecked(
  sql: string,
  {
    engine,
    tables,
    signal,
    trace,
    attempt = 1,
  }: { engine: Engine; tables: string[]; signal: AbortSignal; trace: Trace; attempt?: number },
): Promise<{ sql: string; result: PagedResult }> {
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
  return { sql: checked, result }
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
  const { sql: checked, result } = await openChecked(sql, {
    engine,
    tables,
    signal,
    trace,
    attempt,
  })
  const runSignal = AbortSignal.any([signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
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
    return buildContext({ datasets, mode, samples, relationships: input.relationships })
  })

  const call: PlanCall = {
    provider,
    answerId: input.answerId,
    question: input.question,
    mode,
    tables,
    dataValues: countDataValues(context),
    signal,
    onLog: input.onLog,
  }
  let messages = buildPlanMessages({
    context,
    question: input.question,
    history: input.history,
    today: input.today,
  })
  let current: SqlPlan | null = null
  let lastSql: string | null = null
  let explorations = 0
  let toldToAnswer = false

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await trace.step('plan', attempt, async (step) => {
        const planned = await planCall(call, messages, attempt === 1 ? 'plan' : 'repair')
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

    // Exploration (F-ASK-15): look at the data, then plan again. Doesn't use up a repair attempt.
    if (current.kind === 'explore') {
      attempt -= 1
      if (mode === 'balanced' && current.sql && explorations < MAX_EXPLORATIONS) {
        explorations += 1
        const n = explorations
        const sql = current.sql
        let observation: string
        try {
          const result = await trace.step(
            'explore',
            n,
            () => exploreQuery(engine, sql, tables, signal),
            sql,
          )
          call.dataValues += explorationValues(result)
          observation = describeExploration(n, { result })
        } catch (error) {
          if (isCancellation(error)) throw error
          observation = describeExploration(n, { error: describeFailure(toAppError(error)) })
        }
        messages = buildExploreMessages(messages, current, observation, MAX_EXPLORATIONS - n)
        continue
      }
      if (toldToAnswer) {
        return {
          kind: 'failed',
          plan: current,
          sql: lastSql,
          error: new AppError({
            code: 'ai_bad_output',
            message: 'The AI kept exploring the data instead of answering. Try rephrasing.',
            detail: null,
          }).toJSON(),
          trace: trace.steps,
        }
      }
      toldToAnswer = true
      messages = buildNoExploreMessages(
        messages,
        current,
        mode === 'balanced'
          ? 'That was the last exploration.'
          : 'Exploring is not available in Strict privacy mode.',
      )
      continue
    }

    const python = current.kind === 'python' && Boolean(current.sql) && Boolean(current.python)
    if (current.kind !== 'sql' && !python) {
      return { kind: 'no-sql', plan: current, trace: trace.steps }
    }
    lastSql = current.sql ?? ''
    try {
      if (python) {
        // The input rows for df; the code itself runs only after the user approves it.
        const opened = await openChecked(lastSql, { engine, tables, signal, trace, attempt })
        return {
          kind: 'python',
          plan: current,
          sql: opened.sql,
          input: opened.result,
          messages,
          trace: trace.steps,
        }
      }
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
