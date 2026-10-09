import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { EvalCaseDialog } from '@/features/ask/EvalCaseDialog'
import { cn } from '@/lib/utils'
import type { Answer } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { useFeedbackStore, type EvalCase } from '@/stores/feedback'

/**
 * 👍/👎 on an answer (F-ASK-14). A 👍 saves the answer as an eval case, which also guides similar
 * questions on the same data in Balanced mode (F-ASK-20). Everything stays on this device.
 */
export function FeedbackBar({ answer }: { answer: Answer }) {
  const rating = useFeedbackStore((state) => state.ratings[answer.id] ?? null)
  const saved = useFeedbackStore((state) => answer.id in state.liked)
  const rate = useFeedbackStore((state) => state.rate)
  const like = useFeedbackStore((state) => state.like)
  const unlike = useFeedbackStore((state) => state.unlike)
  const datasets = useDatasetsStore((state) => state.datasets)
  const [dialog, setDialog] = useState(false)

  const goodCase = (): Omit<EvalCase, 'id' | 'at'> | null => {
    if (!answer.sql) return null
    const table = answer.plan?.tablesUsed[0] ?? answer.tables[0] ?? ''
    const dataset = datasets.find((d) => d.table === table)
    return {
      dataset: table,
      fileName: dataset?.source.fileName ?? null,
      schemaHash: dataset?.schemaHash ?? null,
      question: answer.question,
      referenceSql: answer.sql,
      generatedSql: null,
      rating: 'up',
      problem: null,
      notes: null,
    }
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="mr-1">Was this right?</span>
      <IconButton
        label="Good answer"
        size="icon-xs"
        aria-pressed={rating === 'up'}
        className={cn(rating === 'up' && 'text-foreground')}
        onClick={() => (rating === 'up' ? unlike(answer.id) : like(answer.id, goodCase()))}
      >
        <ThumbsUp className={cn(rating === 'up' && 'fill-current')} />
      </IconButton>
      <IconButton
        label="Bad answer"
        size="icon-xs"
        aria-pressed={rating === 'down'}
        className={cn(rating === 'down' && 'text-foreground')}
        onClick={() => {
          if (rating === 'up') unlike(answer.id)
          rate(answer.id, rating === 'down' ? null : 'down')
          if (rating !== 'down') setDialog(true)
        }}
      >
        <ThumbsDown className={cn(rating === 'down' && 'fill-current')} />
      </IconButton>
      {saved && (
        <span
          className="ml-1"
          title="Saved on this device. In Balanced mode, similar questions on this data follow this answer. Export or delete saved answers in Settings."
        >
          Saved as an example
        </span>
      )}
      {rating === 'down' && (
        <Button size="xs" variant="ghost" onClick={() => setDialog(true)}>
          What was wrong?
        </Button>
      )}
      <EvalCaseDialog answer={answer} open={dialog} onOpenChange={setDialog} />
    </div>
  )
}
