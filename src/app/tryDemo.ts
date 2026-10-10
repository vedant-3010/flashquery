import { FINANCE_DEMO, SALES_DEMO, type DemoSet } from '@/ai/fixtures'
import type { SampleId } from '@/engine/samples'
import { useAskStore } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'

// "Try it free" (F-HOME-04, PRD D99, D117): /app/try opens a sample project, loads its sample and
// asks its headline question, so a visitor sees an answer without doing anything. /app/try is the
// 1M-row Global Sales; `?sample=company-finances` is the finance sample.

export interface TryDemo {
  sampleId: SampleId
  /** Fixed, so it stays a project guests may open (D115) even after a rename. */
  projectId: string
  projectName: string
  demo: DemoSet
}

const SALES_TRY: TryDemo = {
  sampleId: 'global-sales-1m',
  projectId: 'try-global-sales',
  projectName: 'Sample: Global Sales',
  demo: SALES_DEMO,
}

export const TRY_DEMOS: readonly TryDemo[] = [
  SALES_TRY,
  {
    sampleId: 'company-finances',
    projectId: 'try-company-finances',
    projectName: 'Sample: Company finances',
    demo: FINANCE_DEMO,
  },
]

/** The try demo for a `?sample=` value; the sales one by default. */
export function tryDemoFor(sampleId: string | null | undefined): TryDemo {
  return TRY_DEMOS.find((demo) => demo.sampleId === sampleId) ?? SALES_TRY
}

/** The sample projects anyone may open, signed in or not (D115). */
export function isTryProject(projectId: string): boolean {
  return TRY_DEMOS.some((demo) => demo.projectId === projectId)
}

export function startTryDemo(sampleId?: SampleId): void {
  const { demo } = tryDemoFor(sampleId)
  const question = demo.fixtures[0]?.question
  const ready = () => useDatasetsStore.getState().datasets.some((d) => d.table === demo.table)
  const loading = () => useDatasetsStore.getState().jobs.some((job) => job.table === demo.table)
  if (!ready() && !loading()) useDatasetsStore.getState().loadSample(demo.sampleId)

  const ask = () => {
    if (question) void useAskStore.getState().ask(question)
  }
  if (ready()) {
    ask()
    return
  }
  const stop = useDatasetsStore.subscribe((state) => {
    if (ready()) {
      stop()
      ask()
    } else if (!state.jobs.some((job) => job.table === demo.table)) {
      stop() // The sample failed or was cancelled: the job row shows why.
    }
  })
}
