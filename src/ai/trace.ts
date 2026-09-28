import type { Usage } from '@/ai/log'
import { isCancellation, toAppError } from '@/lib/errors'

// The answer's trace (docs/PRD.md §7 TraceStep): every stage of every attempt with its timing,
// SQL, error and tokens. Drives the pipeline timeline (F-ASK-06) and the Trace tab (F-EXPL-06).

export type StageId = 'context' | 'plan' | 'guard' | 'explain' | 'execute' | 'summary'

export const STAGE_LABELS: Record<StageId, string> = {
  context: 'Reading schema',
  plan: 'Writing SQL',
  guard: 'Checking SQL',
  explain: 'Checking SQL',
  execute: 'Running',
  summary: 'Summarizing',
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
}

/** Records steps and reports a fresh copy after every change. */
export class Trace {
  readonly steps: TraceStep[] = []
  private readonly onChange: (steps: TraceStep[]) => void

  constructor(onChange: (steps: TraceStep[]) => void = () => undefined) {
    this.onChange = onChange
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
