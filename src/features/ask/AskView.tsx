import { MessageSquareText } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { AnswerCard } from '@/features/ask/AnswerCard'
import { Composer } from '@/features/ask/Composer'
import { prefetchCharts } from '@/features/charts/prefetch'
import { FirstRun } from '@/features/ask/FirstRun'
import { QuickTour } from '@/features/ask/QuickTour'
import { useAskStore } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { useUiStore } from '@/stores/ui'

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/** The answer feed and the ask box (F-ASK-01, F-ASK-08). */
export function AskView() {
  const answers = useAskStore((state) => state.answers)
  const running = useAskStore((state) => state.running)
  const cancel = useAskStore((state) => state.cancel)
  const hasData = useDatasetsStore((state) => state.datasets.length > 0)
  const active = useUiStore((state) => state.view === 'workspace')
  const input = useRef<HTMLTextAreaElement>(null)
  const feed = useRef<HTMLElement>(null)
  const last = answers.at(-1)
  const lastId = last?.id
  const lastDone = last !== undefined && last.status !== 'running'

  // `/` focuses the ask box; Esc cancels a running question (F-ASK-07).
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && running) {
        // Dialogs and menus handle their own Esc.
        if (document.querySelector('[role="dialog"], [role="menu"]')) return
        cancel()
      } else if (event.key === '/' && !isTyping(event.target) && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, running, cancel])

  // The first answer's chart shouldn't wait for the chart code.
  useEffect(() => {
    if (running) prefetchCharts()
  }, [running])

  // Bring each new question into view, and again once its answer has grown.
  useEffect(() => {
    if (!lastId) return
    const card = feed.current?.querySelector(`[data-answer-id="${lastId}"]`)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    card?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [lastId, lastDone])

  if (!hasData && answers.length === 0) return <FirstRun />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section
        ref={feed}
        aria-label="Answers"
        // relative: absolutely positioned children (sr-only text) scroll with the feed instead of
        // stretching the page.
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 empty:hidden">
          <QuickTour />
        </div>
        {answers.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="Ask a question about your data"
            description="Answers appear here with the SQL behind them and a plain-English explanation. Queries run on this device."
          />
        ) : (
          <div className="mx-auto grid w-full max-w-3xl gap-6 p-4">
            {answers.map((answer) => (
              <div key={answer.id} data-answer-id={answer.id} className="scroll-mt-4">
                <AnswerCard answer={answer} />
              </div>
            ))}
          </div>
        )}
      </section>
      <Composer inputRef={input} />
    </div>
  )
}
