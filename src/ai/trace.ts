import type { Usage } from '@/ai/log'
import { isCancellation, toAppError } from '@/lib/errors'

// The answer's trace (docs/PRD.md §7 TraceStep): every stage of every attempt with its timing,
// SQL, error and tokens. Drives the pipeline timeline (F-ASK-06) and the Trace tab (F-EXPL-06).

export type StageId =
  | 'context'
  | 'plan'
  | 'explore'
  | 'guard'
  | 'explain'
  | 'execute'
  | 'check'
  | 'chart'
  | 'summary'
  | 'narrate'
  | 'python'

export const STAGE_LABELS: Record<StageId, string> = {
  context: 'Reading schema',
  plan: 'Writing SQL',
  /** A query the AI ran to look at the data first (F-ASK-15). */
  explore: 'Exploring data',
  guard: 'Checking SQL',
  explain: 'Checking SQL',
  execute: 'Running',
  /** A result that looks wrong goes back to the model once (F-ASK-21). */
  check: 'Checking result',
  chart: 'Choosing chart',
  summary: 'Summarizing',
  /** The AI summary (F-ASK-12), after the answer is shown. */
  narrate: 'Writing summary',
  /** Approved code running in Pyodide (F-PY-04). */
  python: 'Running Python',
}

export interface TraceStep {
  stage: StageId
  /** 1 for the first try; 2 and 3 are self-corrections. */
  attempt: number
  status: 'running' | 'done' | 'error' | 'cancelled'
  startedAt: number
  ms: number | null
  sql: string | null
  error: string | null
  usage: Usage | null
  /** A short finding shown with the step ("Effort: high, rolling window"; "No rows came back"). */
  note?: string
}

/** Records steps and reports a fresh copy after every change. */
export class Trace {
  readonly steps: TraceStep[] = []
  private readonly onChange: (steps: TraceStep[]) => void

  /** `initial`: steps so far, when a later stage (the AI summary) extends an answer's trace. */
  constructor(onChange: (steps: TraceStep[]) => void = () => undefined, initial: TraceStep[] = []) {
    this.onChange = onChange
    this.steps.push(...initial.map((step) => ({ ...step })))
  }

  private emit() {
    this.onChange(this.steps.map((step) => ({ ...step })))
  }

  /** Runs `task` as one step; the step ends done, error or cancelled. */
  async step<T>(
    stage: StageId,
    attempt: number,
    task: (step: TraceStep) => Promise<T>,
    sql: string | null = null,
    note?: string,
  ): Promise<T> {
    const step: TraceStep = {
      stage,
      attempt,
      status: 'running',
      startedAt: Date.now(),
      ms: null,
      sql,
      error: null,
      usage: null,
      ...(note ? { note } : {}),
    }
    this.steps.push(step)
    this.emit()
    const started = performance.now()
    try {
      const value = await task(step)
      step.status = 'done'
      return value
    } catch (error) {
      step.status = isCancellation(error) ? 'cancelled' : 'error'
      step.error = toAppError(error).message
      throw error
    } finally {
      step.ms = performance.now() - started
      this.emit()
    }
  }
}
