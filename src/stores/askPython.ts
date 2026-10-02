import { chooseChart, openChecked, planCall } from '@/ai/pipeline'
import { buildRepairMessages, type PromptMessage } from '@/ai/prompts/planSql'
import type { AnswerSummary } from '@/ai/schemas'
import { summarizeLocally } from '@/ai/summary'
import { Trace } from '@/ai/trace'
import { getDb } from '@/engine/duckdb'
import { closeResult, type PagedResult } from '@/engine/paging'
import { dropPythonResult, loadPythonResult, pythonInput } from '@/engine/pythonData'
import { AppError, isCancellation, toAppError } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import type { Answer } from '@/stores/ask'
import { currentProvider, logRequest } from '@/stores/askSupport'
import { useEngineStore } from '@/stores/engine'
import { useSettingsStore } from '@/stores/settings'
import { PYTHON_TIMEOUT_MS, resetPython, runPython } from '@/workers/clients'

// Python answers (F-PY-01…05). The pipeline stops at the approved-code boundary: the plan's input
// query has run, the code is shown, and nothing executes until the user clicks Run (or turned on
// auto-run). Stop and the 60 s timeout terminate the worker; the UI says the session was reset.

export interface PythonRun {
  code: string
  /** The rows `df` is built from: the plan's guarded query. */
  input: PagedResult
  inputSql: string
  phase: 'ready' | 'loading' | 'running' | 'done' | 'error' | 'stopped'
  /** Progress while Pyodide or packages load. */
  status: string | null
  stdout: string
  /** A traceback, or why the run stopped. */
  error: string | null
  /** The one AI fix after a failure (F-PY-04) has been used. */
  fixed: boolean
  /** Rows sent to Python when the input was sampled (it had more than 200,000). */
  sampledRows: number | null
  /** Temp table holding `result`. */
  resultTable: string | null
}

interface AskBridge {
  find: (id: string) => Answer | undefined
  patch: (id: string, change: Partial<Answer>) => void
}

let bridge: AskBridge | null = null
/** Called by stores/ask.ts once, to avoid a circular import. */
export function connectAsk(next: AskBridge) {
  bridge = next
}
const ask = () => {
  if (!bridge) throw new Error('askPython used before the ask store was created')
  return bridge
}

const controllers = new Map<string, AbortController>()
/** The planning conversation of each Python answer, for the one AI fix. */
const conversations = new Map<string, PromptMessage[]>()

export function rememberConversation(id: string, messages: PromptMessage[]) {
  conversations.set(id, messages)
}

function patchPython(id: string, change: Partial<PythonRun>, answer: Partial<Answer> = {}) {
  const python = ask().find(id)?.python
  if (python) ask().patch(id, { ...answer, python: { ...python, ...change } })
}

function setRuntime(state: 'not-loaded' | 'loading' | 'ready' | 'error') {
  useEngineStore.setState({ python: state })
}

export const isPythonBusy = (python: PythonRun | null) =>
  python?.phase === 'loading' || python?.phase === 'running'

/** Runs an answer's (approved) Python code on its input rows. */
export async function runPythonAnswer(id: string): Promise<void> {
  const answer = ask().find(id)
  const python = answer?.python
  if (!answer || !python || isPythonBusy(python)) return
  const controller = new AbortController()
  controllers.set(id, controller)
  const trace = new Trace((steps) => ask().patch(id, { trace: steps }), answer.trace)
  const attempt = answer.trace.filter((step) => step.stage === 'python').length + 1
  let loaded = useEngineStore.getState().python === 'ready'
  if (!loaded) setRuntime('loading')
  patchPython(id, { phase: loaded ? 'running' : 'loading', status: null, error: null, stdout: '' })

  try {
    await trace.step('python', attempt, async () => {
      const engine = await getDb()
      const input = await pythonInput(engine, python.input, controller.signal)
      const output = await runPython(
        { code: python.code, csv: input.csv, dateColumns: input.dateColumns },
        {
          signal: controller.signal,
          onStatus: (status) => patchPython(id, { status }),
          onLoaded: () => {
            loaded = true
            setRuntime('ready')
            patchPython(id, { phase: 'running', status: 'Running…' })
          },
        },
      )
      if (!output.ok) {
        patchPython(id, {
          phase: 'error',
          error: output.error,
          stdout: output.stdout,
          status: null,
        })
        throw new AppError({
          code: 'python_error',
          message: 'The Python code failed.',
          detail: output.error,
        })
      }
      if (output.resultCsv === null) {
        const error = 'The code ran but did not assign `result` (a pandas DataFrame).'
        patchPython(id, { phase: 'error', error, stdout: output.stdout, status: null })
        throw new AppError({ code: 'python_error', message: error, detail: null })
      }

      const loadedResult = await loadPythonResult(engine, output.resultCsv, controller.signal)
      const current = ask().find(id)
      const { rows, chart } = await chooseChart(
        engine,
        loadedResult.result,
        {
          question: answer.question,
          hint: answer.plan?.chartHint ?? null,
          title: answer.plan?.title,
          currency: useSettingsStore.getState().currency,
        },
        controller.signal,
      )
      const caveats: string[] = []
      if (input.sampled) {
        caveats.push(
          `Python saw a random sample of ${formatNumber(input.rows, 'en-US')} of ${formatNumber(python.input.rowCount, 'en-US')} rows.`,
        )
      }
      if (output.resultRows !== null && output.resultRows > loadedResult.result.rowCount) {
        caveats.push(
          `The result had ${formatNumber(output.resultRows, 'en-US')} rows; the first ${formatNumber(loadedResult.result.rowCount, 'en-US')} are shown.`,
        )
      }
      const summary: AnswerSummary = output.summary
        ? { headline: output.summary, bullets: [], caveats }
        : {
            ...summarizeLocally({
              columns: loadedResult.result.columns,
              rows,
              rowCount: loadedResult.result.rowCount,
              locale: useSettingsStore.getState().locale,
              spec: chart.spec,
              data: chart.data,
            }),
          }
      if (!output.summary) summary.caveats.push(...caveats)

      // Replace an earlier run's result.
      if (current?.python?.resultTable) {
        if (current.result) await closeResult(engine, current.result)
        await dropPythonResult(engine, current.python.resultTable)
      }
      patchPython(
        id,
        {
          phase: 'done',
          status: null,
          stdout: output.stdout,
          resultTable: loadedResult.table,
          sampledRows: input.sampled ? input.rows : null,
        },
        {
          status: 'answered',
          result: loadedResult.result,
          rows,
          chart,
          chartPicked: false,
          summary,
          summarySource: output.summary ? 'python' : 'local',
          summaryModel: null,
          error: null,
        },
      )
    })
  } catch (error) {
    const failure = toAppError(error)
    if (failure.code === 'cancelled' || failure.code === 'timeout' || isCancellation(error)) {
      setRuntime('not-loaded')
      const why =
        failure.code === 'timeout'
          ? `Python stopped after ${Math.round(PYTHON_TIMEOUT_MS / 1000)} s.`
          : 'Python was stopped.'
      patchPython(id, {
        phase: 'stopped',
        status: null,
        error: `${why} The Python session was reset; Python and its packages load again on the next run.`,
      })
    } else if (failure.code !== 'python_error') {
      if (!loaded) setRuntime('error')
      patchPython(id, { phase: 'error', status: null, error: failure.message })
    }
  } finally {
    if (controllers.get(id) === controller) controllers.delete(id)
  }
}

/** Stop (F-PY-05): the worker is terminated and recreated on the next run. */
export function stopPython(id: string): void {
  controllers.get(id)?.abort()
}

export function setPythonCode(id: string, code: string): void {
  patchPython(id, { code })
}

/** Whether the one AI fix is available: a real provider, a failed run, not used yet. */
export function canFixPython(answer: Answer): boolean {
  return (
    !answer.demo &&
    answer.python?.phase === 'error' &&
    !answer.python.fixed &&
    conversations.has(answer.id)
  )
}

/** One AI fix after a failure (F-PY-04): the traceback goes back to the model; the user runs it. */
export async function fixPython(id: string): Promise<void> {
  const answer = ask().find(id)
  const python = answer?.python
  const messages = conversations.get(id)
  if (!answer || !python || !answer.plan || !messages || python.fixed) return
  patchPython(id, { status: 'Asking the AI for a fix…' })
  try {
    const settings = useSettingsStore.getState()
    const failed = { ...answer.plan, python: python.code }
    const repair = buildRepairMessages(messages, failed, python.error ?? 'It failed.', 'Python')
    const { plan } = await planCall(
      {
        provider: await currentProvider(),
        answerId: id,
        question: answer.question,
        mode: settings.privacyMode,
        tables: answer.tables,
        dataValues: 0,
        signal: AbortSignal.timeout(120_000),
        onLog: logRequest,
      },
      repair,
      'repair',
    )
    if (plan.kind !== 'python' || !plan.python || !plan.sql) {
      throw new AppError({
        code: 'ai_bad_output',
        message: "The AI didn't return Python code.",
        detail: null,
      })
    }
    let input = python.input
    let inputSql = python.inputSql
    if (plan.sql.trim() !== python.inputSql.trim()) {
      const engine = await getDb()
      const opened = await openChecked(plan.sql, {
        engine,
        tables: answer.tables,
        signal: AbortSignal.timeout(60_000),
        trace: new Trace((steps) => ask().patch(id, { trace: steps }), ask().find(id)?.trace ?? []),
      })
      await closeResult(engine, python.input)
      input = opened.result
      inputSql = opened.sql
    }
    conversations.set(id, repair)
    patchPython(
      id,
      {
        code: plan.python,
        input,
        inputSql,
        phase: 'ready',
        fixed: true,
        status: null,
        error: null,
      },
      { plan, sql: inputSql },
    )
  } catch (error) {
    patchPython(id, {
      status: null,
      error: `${python.error ?? ''}\n\nThe AI fix failed: ${toAppError(error).message}`,
    })
  }
}

/** New input SQL for a Python answer (edited in its SQL tab): guarded and opened; Run uses it. */
export async function setPythonInput(id: string, sql: string): Promise<void> {
  const answer = ask().find(id)
  const python = answer?.python
  if (!answer || !python || isPythonBusy(python)) return
  const engine = await getDb()
  const opened = await openChecked(sql, {
    engine,
    tables: answer.tables,
    signal: AbortSignal.timeout(60_000),
    trace: new Trace((steps) => ask().patch(id, { trace: steps }), answer.trace),
  })
  await closeResult(engine, python.input)
  patchPython(
    id,
    { input: opened.result, inputSql: opened.sql, phase: 'ready', error: null },
    { sql: opened.sql, edited: true },
  )
}

/** Frees an answer's Python state (its input view and result table). */
export async function releasePython(id: string, python: PythonRun | null): Promise<void> {
  controllers.get(id)?.abort()
  conversations.delete(id)
  if (!python) return
  const engine = await getDb()
  await closeResult(engine, python.input)
  if (python.resultTable) await dropPythonResult(engine, python.resultTable)
}

export { resetPython }
