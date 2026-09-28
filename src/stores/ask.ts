import { create } from 'zustand'
import { executeSql, runPipeline } from '@/ai/pipeline'
import type { Turn } from '@/ai/prompts/planSql'
import { createProvider, type LLMProvider } from '@/ai/providers'
import { fixtureProvider } from '@/ai/providers/fixture'
import type { AnswerSummary, SqlPlan } from '@/ai/schemas'
import { Trace, type TraceStep } from '@/ai/trace'
import { getDb } from '@/engine/duckdb'
import { closeResult, type PagedResult } from '@/engine/paging'
import type { CellValue } from '@/engine/types'
import { AppError, isCancellation, toAppError, type AppErrorData } from '@/lib/errors'
import { useAiLogStore } from '@/stores/aiLog'
import { useDatasetsStore } from '@/stores/datasets'
import { useHistoryStore } from '@/stores/history'
import { activeApiKey, useSettingsStore } from '@/stores/settings'

// The answer feed (F-ASK-01…11): one question runs at a time; each becomes an answer card.

export interface Answer {
  id: string
  question: string
  createdAt: number
  status: 'running' | 'answered' | 'no-sql' | 'failed' | 'cancelled'
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
  previewRows: CellValue[][]
  summary: AnswerSummary | null
  error: AppErrorData | null
}

interface AskState {
  answers: Answer[]
  /** Tables questions are about; null = all loaded tables. */
  scope: string[] | null
  running: string | null
  ask: (question: string) => Promise<void>
  cancel: () => void
  runEditedSql: (id: string, sql: string) => Promise<void>
  remove: (id: string) => void
  setScope: (scope: string[] | null) => void
}

let counter = 0
let controller: AbortController | null = null
let providerCache: { key: string; provider: Promise<LLMProvider> } | null = null

/** The configured provider, or demo fixtures when there's no key (F-AI-03). */
function currentProvider(): Promise<LLMProvider> {
  const settings = useSettingsStore.getState()
  const apiKey = activeApiKey(settings)
  if (!apiKey) return Promise.resolve(fixtureProvider)
  const model = settings.models[settings.provider]
  const cacheKey = `${settings.provider}:${model}:${apiKey}`
  if (providerCache?.key !== cacheKey) {
    providerCache = {
      key: cacheKey,
      provider: createProvider({ provider: settings.provider, apiKey, model }),
    }
  }
  return providerCache.provider
}

/** Follow-up context: the last answered turns (question, SQL, column names, row count). */
function turns(answers: Answer[]): Turn[] {
  return answers
    .filter((answer) => answer.status === 'answered' && answer.result)
    .slice(-3)
    .map((answer) => ({
      question: answer.question,
      sql: answer.sql,
      columns: answer.result?.columns.map((column) => column.name) ?? [],
      rowCount: answer.result?.rowCount ?? null,
    }))
}

/** The user's local date (not UTC), so "this month" means what they expect. */
const today = () => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Drops an answer's temp result view once nothing shows it any more. */
function release(result: PagedResult | null) {
  if (!result) return
  getDb()
    .then((engine) => closeResult(engine, result))
    .catch((error: unknown) => console.warn('AskData: could not drop a result view', error))
}

export const useAskStore = create<AskState>()((set, get) => {
  const patch = (id: string, change: Partial<Answer>) =>
    set((state) => ({ answers: state.answers.map((a) => (a.id === id ? { ...a, ...change } : a)) }))

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
            previewRows: [],
            summary: null,
            error: null,
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
          today: today(),
          signal: current.signal,
          onTrace: (trace) => patch(id, { trace }),
          onLog: (entry) => {
            const keys = Object.values(useSettingsStore.getState().apiKeys).filter(
              (key): key is string => key !== null,
            )
            useAiLogStore.getState().add(entry, keys)
          },
        })
        if (outcome.kind === 'answer') {
          const { plan, sql, result, previewRows, summary, trace } = outcome
          patch(id, { status: 'answered', plan, sql, result, previewRows, summary, trace })
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
        const answer = get().answers.find((a) => a.id === id)
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
      const answer = get().answers.find((a) => a.id === id)
      if (!answer) return
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
          locale: useSettingsStore.getState().locale,
          signal: new AbortController().signal,
          trace,
        })
        release(get().answers.find((a) => a.id === id)?.result ?? null)
        patch(id, {
          ...executed,
          status: 'answered',
          edited: true,
          error: null,
          trace: trace.steps,
        })
        record('answered', executed.summary.headline, executed.result.rowCount)
      } catch (error) {
        // The edited SQL failed: keep the previous result; the SQL tab shows why.
        const failure = toAppError(error)
        record('failed', failure.message, null)
        throw failure
      }
    },

    remove: (id) => {
      release(get().answers.find((a) => a.id === id)?.result ?? null)
      set((state) => ({ answers: state.answers.filter((a) => a.id !== id) }))
    },

    setScope: (scope) => set({ scope }),
  }
})
