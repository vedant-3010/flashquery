import { create } from 'zustand'
import {
  canNarrate,
  executeSql,
  narrate,
  runPipeline,
  type AnswerChart,
  type SqlResult,
} from '@/ai/pipeline'
import type { LLMProvider } from '@/ai/providers'
import type { AnswerSummary, PrivacyMode, SqlPlan } from '@/ai/schemas'
import { Trace, type TraceStep } from '@/ai/trace'
import type { ChartSpec } from '@/charts/spec'
import { loadChartData, needsNewData } from '@/engine/chartData'
import { getDb } from '@/engine/duckdb'
import type { PagedResult } from '@/engine/paging'
import type { CellValue } from '@/engine/types'
import { AppError, isCancellation, toAppError, type AppErrorData } from '@/lib/errors'
import {
  connectAsk,
  releasePython,
  rememberConversation,
  runPythonAnswer,
  setPythonInput,
  type PythonRun,
} from '@/stores/askPython'
import { currentProvider, logRequest, release, today, turns } from '@/stores/askSupport'
import { useDatasetsStore } from '@/stores/datasets'
import { useHistoryStore } from '@/stores/history'
import { activeApiKey, useSettingsStore } from '@/stores/settings'

// The answer feed (F-ASK-01…12): one question runs at a time; each becomes an answer card with a
// chart (F-VIZ). In Balanced mode the AI summary replaces the local one once it arrives.

export interface Answer {
  id: string
  question: string
  createdAt: number
  /** 'python': a Python plan whose code hasn't run successfully yet (F-PY-03). */
  status: 'running' | 'answered' | 'no-sql' | 'python' | 'failed' | 'cancelled'
  /** Answered from demo fixtures (no API key). */
  demo: boolean
  /** Tables the question was asked about. */
  tables: string[]
  trace: TraceStep[]
  plan: SqlPlan | null
  sql: string | null
  /** The SQL was edited by the user (F-EXPL-01). */
  edited: boolean
  result: PagedResult | null
  /** The result's first rows (all of them up to 5,000). */
  rows: CellValue[][]
  chart: AnswerChart | null
  /** The chart was picked or adjusted by the user (F-VIZ-03, F-VIZ-06). */
  chartPicked: boolean
  summary: AnswerSummary | null
  /** Who wrote the summary: this device, the AI (and which model), or the Python code. */
  summarySource: 'local' | 'ai' | 'python'
  summaryModel: string | null
  error: AppErrorData | null
  /** Python plans (F-PY-01…05): the code, its input and its last run. */
  python: PythonRun | null
}

interface AskState {
  answers: Answer[]
  /** Tables questions are about; null = all loaded tables. */
  scope: string[] | null
  running: string | null
  ask: (question: string) => Promise<void>
  cancel: () => void
  runEditedSql: (id: string, sql: string) => Promise<void>
  /** Switches or adjusts an answer's chart; reads new chart data when the chart needs it. */
  setChart: (id: string, spec: ChartSpec) => Promise<void>
  remove: (id: string) => void
  setScope: (scope: string[] | null) => void
}

let counter = 0
let controller: AbortController | null = null
/** In-flight AI summaries by answer id. */
const summaries = new Map<string, AbortController>()

export const useAskStore = create<AskState>()((set, get) => {
  const patch = (id: string, change: Partial<Answer>) =>
    set((state) => ({ answers: state.answers.map((a) => (a.id === id ? { ...a, ...change } : a)) }))
  const find = (id: string) => get().answers.find((a) => a.id === id)

  const answered = (executed: SqlResult): Partial<Answer> => ({
    status: 'answered',
    sql: executed.sql,
    result: executed.result,
    rows: executed.rows,
    chart: executed.chart,
    chartPicked: false,
    summary: executed.summary,
    summarySource: 'local',
    summaryModel: null,
  })

  /** F-ASK-12: the AI summary, after the answer is on screen; the local one stays on failure. */
  function summarize(id: string, provider: LLMProvider, mode: PrivacyMode) {
    const answer = find(id)
    if (!answer?.result || !answer.chart || !answer.sql || !canNarrate(provider, mode)) return
    const { result, rows, chart, sql, plan, question, trace: steps } = answer
    summaries.get(id)?.abort()
    const current = new AbortController()
    summaries.set(id, current)
    const trace = new Trace((trace) => patch(id, { trace }), steps)
    getDb()
      .then((engine) =>
        narrate({
          answerId: id,
          question,
          plan,
          sql,
          result,
          rows,
          spec: chart.spec,
          provider,
          engine,
          mode,
          signal: current.signal,
          trace,
          onLog: logRequest,
        }),
      )
      .then(({ summary, model }) => {
        if (!current.signal.aborted) {
          patch(id, { summary, summarySource: 'ai', summaryModel: model })
        }
      })
      .catch((error: unknown) => {
        // Shown in the timeline and trace; the local summary stays.
        if (!isCancellation(error)) console.warn('AskData: the AI summary failed', error)
      })
      .finally(() => {
        if (summaries.get(id) === current) summaries.delete(id)
      })
  }

  return {
    answers: [],
    scope: null,
    running: null,

    ask: async (question) => {
      const text = question.trim()
      if (!text) return
      get().cancel()
      const current = new AbortController()
      controller = current
      const id = `ans_${Date.now().toString(36)}_${(counter += 1)}`
      const { scope } = get()
      const datasets = useDatasetsStore
        .getState()
        .datasets.filter((dataset) => scope === null || scope.includes(dataset.table))
      const settings = useSettingsStore.getState()
      const history = turns(get().answers)
      set((state) => ({
        running: id,
        answers: [
          ...state.answers,
          {
            id,
            question: text,
            createdAt: Date.now(),
            status: 'running',
            demo: !activeApiKey(settings),
            tables: datasets.map((dataset) => dataset.table),
            trace: [],
            plan: null,
            sql: null,
            edited: false,
            result: null,
            rows: [],
            chart: null,
            chartPicked: false,
            summary: null,
            summarySource: 'local',
            summaryModel: null,
            error: null,
            python: null,
          },
        ],
      }))

      try {
        if (datasets.length === 0) {
          throw new AppError({
            code: 'no_data',
            message: 'Load a dataset first: try the sample data or drop a file.',
            detail: null,
          })
        }
        const [provider, engine] = await Promise.all([currentProvider(), getDb()])
        const outcome = await runPipeline({
          answerId: id,
          question: text,
          provider,
          engine,
          datasets,
          mode: settings.privacyMode,
          history,
          locale: settings.locale,
          currency: settings.currency,
          today: today(),
          signal: current.signal,
          onTrace: (trace) => patch(id, { trace }),
          onLog: logRequest,
        })
        if (outcome.kind === 'answer') {
          patch(id, { ...answered(outcome), plan: outcome.plan, trace: outcome.trace })
          summarize(id, provider, settings.privacyMode)
        } else if (outcome.kind === 'python') {
          patch(id, {
            status: 'python',
            plan: outcome.plan,
            sql: outcome.sql,
            trace: outcome.trace,
            python: {
              code: outcome.plan.python ?? '',
              input: outcome.input,
              inputSql: outcome.sql,
              phase: 'ready',
              status: null,
              stdout: '',
              error: null,
              fixed: false,
              sampledRows: null,
              resultTable: null,
            },
          })
          rememberConversation(id, outcome.messages)
          // Generated code runs only when the user clicks Run, unless they turned on auto-run.
          if (settings.autoRunPython) void runPythonAnswer(id)
        } else if (outcome.kind === 'no-sql') {
          patch(id, { status: 'no-sql', plan: outcome.plan, trace: outcome.trace })
        } else {
          patch(id, {
            status: 'failed',
            plan: outcome.plan,
            sql: outcome.sql,
            error: outcome.error,
            trace: outcome.trace,
          })
        }
        const answer = find(id)
        useHistoryStore.getState().add({
          kind: 'question',
          text,
          sql: answer?.sql ?? null,
          status: outcome.kind === 'answer' ? 'answered' : outcome.kind,
          headline: answer?.summary?.headline ?? null,
          rowCount: answer?.result?.rowCount ?? null,
        })
      } catch (error) {
        if (isCancellation(error)) patch(id, { status: 'cancelled' })
        else patch(id, { status: 'failed', error: toAppError(error).toJSON() })
      } finally {
        if (controller === current) controller = null
        set((state) => (state.running === id ? { running: null } : {}))
      }
    },

    cancel: () => controller?.abort(),

    runEditedSql: async (id, sql) => {
      const answer = find(id)
      if (!answer) return
      // For Python answers the SQL is the input of df: re-open it; the code runs again on Run.
      if (answer.python) return setPythonInput(id, sql)
      const settings = useSettingsStore.getState()
      const trace = new Trace()
      const record = (
        status: 'answered' | 'failed',
        headline: string | null,
        rowCount: number | null,
      ) =>
        useHistoryStore
          .getState()
          .add({ kind: 'query', text: sql.trim(), sql: sql.trim(), status, headline, rowCount })
      try {
        const executed = await executeSql(sql, {
          engine: await getDb(),
          tables: answer.tables,
          locale: settings.locale,
          signal: new AbortController().signal,
          trace,
          chartContext: {
            question: answer.question,
            hint: answer.plan?.chartHint ?? null,
            title: answer.plan?.title,
            currency: settings.currency,
          },
        })
        summaries.get(id)?.abort()
        release(find(id)?.result ?? null)
        patch(id, { ...answered(executed), edited: true, error: null, trace: trace.steps })
        record('answered', executed.summary.headline, executed.result.rowCount)
        summarize(id, await currentProvider(), settings.privacyMode)
      } catch (error) {
        // The edited SQL failed: keep the previous result; the SQL tab shows why.
        const failure = toAppError(error)
        record('failed', failure.message, null)
        throw failure
      }
    },

    setChart: async (id, spec) => {
      const answer = find(id)
      if (!answer?.result || !answer.chart) return
      const current = answer.chart
      const data = needsNewData(current, spec)
        ? await loadChartData(await getDb(), answer.result, spec, answer.rows)
        : current.data
      if (find(id)?.result !== answer.result) return // The SQL was re-run meanwhile.
      patch(id, { chart: { ...current, spec, data }, chartPicked: spec !== current.auto })
    },

    remove: (id) => {
      const python = find(id)?.python ?? null
      releasePython(id, python).catch((error: unknown) =>
        console.warn('AskData: could not free a Python result', error),
      )
      summaries.get(id)?.abort()
      release(find(id)?.result ?? null)
      set((state) => ({ answers: state.answers.filter((a) => a.id !== id) }))
    },

    setScope: (scope) => set({ scope }),
  }
})

connectAsk({
  find: (id) => useAskStore.getState().answers.find((a) => a.id === id),
  patch: (id, change) =>
    useAskStore.setState((state) => ({
      answers: state.answers.map((a) => (a.id === id ? { ...a, ...change } : a)),
    })),
})
