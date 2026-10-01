import { RotateCcw, X } from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import { Badge } from '@/components/ui/badge'
import { AnswerBody } from '@/features/ask/AnswerBody'
import { PinMenu } from '@/features/ask/PinMenu'
import { PipelineTimeline } from '@/features/ask/PipelineTimeline'
import { useAskStore, type Answer } from '@/stores/ask'

/** One question and its answer (F-ASK-08). */
export function AnswerCard({ answer }: { answer: Answer }) {
  const ask = useAskStore((state) => state.ask)
  const remove = useAskStore((state) => state.remove)
  const running = answer.status === 'running'

  return (
    <article aria-label={answer.question} className="grid gap-2">
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground">
        {answer.question}
      </p>
      <div className="grid gap-3 rounded-xl border bg-card p-4">
        <header className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-semibold">
            {answer.plan?.title ?? (running ? 'Working on it…' : answer.question)}
          </h3>
          {answer.demo && (
            <Badge
              variant="secondary"
              title="Demo answers are pre-recorded; SQL runs live on your device."
            >
              Demo
            </Badge>
          )}
          {answer.edited && <Badge variant="outline">Edited</Badge>}
          {answer.status === 'answered' && answer.sql && <PinMenu answer={answer} />}
          {!running && (
            <>
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
            </>
          )}
        </header>
        <PipelineTimeline trace={answer.trace} />
        <AnswerBody answer={answer} />
      </div>
    </article>
  )
}
