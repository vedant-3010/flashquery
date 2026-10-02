import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { EvalCaseDialog } from '@/features/ask/EvalCaseDialog'
import { cn } from '@/lib/utils'
import type { Answer } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { useFeedbackStore } from '@/stores/feedback'
import { useToastStore } from '@/stores/toast'

/** 👍/👎 on an answer (F-ASK-14). Ratings stay on this device. */
export function FeedbackBar({ answer }: { answer: Answer }) {
  const rating = useFeedbackStore((state) => state.ratings[answer.id] ?? null)
  const rate = useFeedbackStore((state) => state.rate)
  const saveCase = useFeedbackStore((state) => state.saveCase)
  const datasets = useDatasetsStore((state) => state.datasets)
  const showToast = useToastStore((state) => state.show)
  const [dialog, setDialog] = useState(false)
  const [saved, setSaved] = useState(false)

  const saveGood = () => {
    if (!answer.sql) return
    const table = answer.plan?.tablesUsed[0] ?? answer.tables[0] ?? ''
    const dataset = datasets.find((d) => d.table === table)
    saveCase({
      dataset: table,
      fileName: dataset?.source.fileName ?? null,
      schemaHash: dataset?.schemaHash ?? null,
      question: answer.question,
      referenceSql: answer.sql,
      generatedSql: null,
      rating: 'up',
      problem: null,
      notes: null,
    })
    setSaved(true)
    showToast('Saved as an eval case. Export them from Settings.')
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="mr-1">Was this right?</span>
      <IconButton
        label="Good answer"
        size="icon-xs"
        aria-pressed={rating === 'up'}
        className={cn(rating === 'up' && 'text-foreground')}
        onClick={() => rate(answer.id, rating === 'up' ? null : 'up')}
      >
        <ThumbsUp className={cn(rating === 'up' && 'fill-current')} />
      </IconButton>
      <IconButton
        label="Bad answer"
        size="icon-xs"
        aria-pressed={rating === 'down'}
        className={cn(rating === 'down' && 'text-foreground')}
        onClick={() => {
          rate(answer.id, rating === 'down' ? null : 'down')
          if (rating !== 'down') setDialog(true)
        }}
      >
        <ThumbsDown className={cn(rating === 'down' && 'fill-current')} />
      </IconButton>
      {rating === 'up' && (
        <Button size="xs" variant="ghost" disabled={saved} onClick={saveGood}>
          {saved ? 'Saved as eval case' : 'Save as eval case'}
        </Button>
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
