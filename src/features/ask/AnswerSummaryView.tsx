import { Info, LoaderCircle } from 'lucide-react'
import { findModel } from '@/ai/models'
import type { Answer } from '@/stores/ask'

/** Headline, bullets and caveats, and who wrote them (F-ASK-11 local, F-ASK-12 AI). */
export function AnswerSummaryView({ answer }: { answer: Answer }) {
  const { summary } = answer
  if (!summary) return null
  const writing = answer.trace.some((step) => step.stage === 'narrate' && step.status === 'running')
  const model = answer.summaryModel
    ? (findModel(answer.summaryModel)?.label ?? answer.summaryModel)
    : null
  return (
    <div className="grid gap-1" aria-live="polite">
      <p className="text-base font-medium">{summary.headline}</p>
      {summary.bullets.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {summary.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      {summary.caveats.map((caveat) => (
        <p key={caveat} className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {caveat}
        </p>
      ))}
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {writing ? (
          <>
            <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
            Writing the AI summary…
          </>
        ) : answer.summarySource === 'python' ? (
          'Summary from the Python code'
        ) : answer.summarySource === 'ai' && model ? (
          `Summary by ${model}, from the result`
        ) : (
          'Summary written on this device'
        )}
      </p>
    </div>
  )
}
