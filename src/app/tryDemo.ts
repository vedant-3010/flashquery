import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { GLOBAL_SALES_TABLE } from '@/engine/samples'
import { useAskStore } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'

// "Try it on 1M rows" (F-HOME-04, PRD D99): /app/try opens the "Sample: Global Sales" project, loads
// the 1,000,000-row sample and asks the headline question, so a visitor sees an answer without
// doing anything.

export const TRY_PROJECT_NAME = 'Sample: Global Sales'
/** Fixed, so it stays the one project guests may open (D115) even after a rename. */
export const TRY_PROJECT_ID = 'try-global-sales'

export function startTryDemo(): void {
  const question = DEMO_QUESTIONS[0]
  const ready = () =>
    useDatasetsStore.getState().datasets.some((d) => d.table === GLOBAL_SALES_TABLE)
  const loading = () =>
    useDatasetsStore.getState().jobs.some((job) => job.table === GLOBAL_SALES_TABLE)
  if (!ready() && !loading()) useDatasetsStore.getState().loadSample('global-sales-1m')

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
    } else if (!state.jobs.some((job) => job.table === GLOBAL_SALES_TABLE)) {
      stop() // The sample failed or was cancelled: the job row shows why.
    }
  })
}
