import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { GLOBAL_SALES_TABLE } from '@/engine/samples'
import { useAskStore } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'

// "Try it on 1M rows" from the landing page (PRD D99): /app/#/try loads the 1,000,000-row sample
// and asks the headline question, so a visitor sees an answer without doing anything.

export const TRY_HASH = '#/try'

export const isTryHash = (hash: string) => hash === TRY_HASH || hash.startsWith(`${TRY_HASH}?`)

export function startTryDemo(): void {
  // Drop the hash, so a reload doesn't run it again.
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
  const question = DEMO_QUESTIONS[0]
  const datasets = useDatasetsStore.getState()
  const ready = () =>
    useDatasetsStore.getState().datasets.some((d) => d.table === GLOBAL_SALES_TABLE)
  if (!ready()) datasets.loadSample('global-sales-1m')

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
