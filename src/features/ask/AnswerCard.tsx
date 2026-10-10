import { RotateCcw, X } from 'lucide-react'
import { useMemo } from 'react'
import { IconButton } from '@/components/IconButton'
import { Badge } from '@/components/ui/badge'
import { AnswerBody } from '@/features/ask/AnswerBody'
import { FeedbackBar } from '@/features/ask/FeedbackBar'
import { PinMenu } from '@/features/ask/PinMenu'
import { PipelineTimeline } from '@/features/ask/PipelineTimeline'
import { UsageSummary } from '@/features/explain/UsageSummary'
import { useAiLogStore } from '@/stores/aiLog'
import { useAskStore, type Answer } from '@/stores/ask'

/** One question and its answer (F-ASK-08). */
export function AnswerCard({ answer }: { answer: Answer }) {
  const ask = useAskStore((state) => state.ask)
  const remove = useAskStore((state) => state.remove)
  const running = answer.status === 'running'
  const log = useAiLogStore((state) => state.entries)
  const usage = useMemo(() => log.filter((entry) => entry.answerId === answer.id), [log, answer.id])

  return (
    <article aria-label={answer.question} className="group/answer grid gap-2">
      {/* The question in a quiet bubble; the answer is what stands out (D118). */}
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm text-foreground">
        {answer.question}
      </p>
      <div className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
        <header className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-medium text-muted-foreground">
            {answer.plan?.title ?? (running ? 'Working on it…' : answer.question)}
          </h3>
          {answer.demo && (
            <Badge
              variant="outline"
              className="text-muted-foreground"
              title="An example answer about the sample data, worked out live on your device."
            >
              Demo
            </Badge>
          )}
          {answer.edited && <Badge variant="outline">Edited</Badge>}
          {/* Python results aren't pinned: refreshing a tile would need to run Python (PRD D63). */}
          {answer.status === 'answered' && answer.sql && !answer.python && (
            <PinMenu answer={answer} />
          )}
          {answer.python && <Badge variant="outline">Python</Badge>}
          {!running && (
            // Shown on hover or focus with a mouse, always on touch (as Linear does).
            <div className="flex items-center transition-opacity pointer-fine:opacity-0 pointer-fine:group-focus-within/answer:opacity-100 pointer-fine:group-hover/answer:opacity-100">
              <IconButton
                label="Ask again"
                size="icon-xs"
                onClick={() => void ask(answer.question)}
              >
                <RotateCcw />
              </IconButton>
              <IconButton label="Remove answer" size="icon-xs" onClick={() => remove(answer.id)}>
                <X />
              </IconButton>
            </div>
          )}
        </header>
        <PipelineTimeline trace={answer.trace} />
        <AnswerBody answer={answer} />
        {!running && (
          <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {answer.status === 'answered' && answer.sql && !answer.python ? (
              <FeedbackBar answer={answer} />
            ) : (
              <span />
            )}
            <UsageSummary entries={usage} label="AI usage" />
          </footer>
        )}
      </div>
    </article>
  )
}
