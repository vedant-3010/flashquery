import { Info, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { DEMO_SETS, demoQuestions } from '@/ai/fixtures'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AnswerSummaryView } from '@/features/ask/AnswerSummaryView'
import { AnswerTabs } from '@/features/ask/AnswerTabs'
import { PythonPanel } from '@/features/python/PythonPanel'
import { useAskStore, type Answer } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { useUiStore } from '@/stores/ui'

function Chips({ questions }: { questions: string[] }) {
  const ask = useAskStore((state) => state.ask)
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
      {questions.map((question) => (
        <li key={question}>
          <Button size="xs" variant="outline" onClick={() => void ask(question)}>
            {question}
          </Button>
        </li>
      ))}
    </ul>
  )
}

function Failed({ answer }: { answer: Answer }) {
  const [showDetails, setShowDetails] = useState(false)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const loadSample = useDatasetsStore((state) => state.loadSample)
  const tables = useDatasetsStore((state) => state.datasets.map((d) => d.table).join('\n'))
  const error = answer.error
  if (!error) return null
  return (
    <div className="grid gap-3">
      <div role="alert" className="grid gap-1 text-sm">
        <p>{error.message}</p>
        {error.detail && (
          <>
            <Button
              size="xs"
              variant="ghost"
              className="w-fit"
              aria-expanded={showDetails}
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </Button>
            {showDetails && (
              <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                {error.detail}
              </pre>
            )}
          </>
        )}
      </div>
      {error.code === 'demo_unmatched' && <Chips questions={demoQuestions(tables.split('\n'))} />}
      {(error.code === 'demo_unmatched' || error.code === 'demo_needs_sample') && (
        <div className="flex flex-wrap gap-2">
          {error.code === 'demo_needs_sample' &&
            DEMO_SETS.map((set) => (
              <Button key={set.sampleId} size="sm" onClick={() => loadSample(set.sampleId)}>
                Load {set.label}
              </Button>
            ))}
          <Button
            size="sm"
            variant={error.code === 'demo_unmatched' ? 'default' : 'outline'}
            onClick={() => openSettings(true)}
          >
            <KeyRound aria-hidden />
            Add an AI key to ask anything
          </Button>
        </div>
      )}
      {(answer.sql !== null || answer.trace.length > 0) && (
        <AnswerTabs answer={answer} withTable={false} />
      )}
    </div>
  )
}

/** What the card shows below its header, by status. */
export function AnswerBody({ answer }: { answer: Answer }) {
  const retry = useAskStore((state) => state.ask)
  switch (answer.status) {
    case 'running':
      return (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )
    case 'cancelled':
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Cancelled.
          <Button size="xs" variant="outline" onClick={() => void retry(answer.question)}>
            Ask again
          </Button>
        </div>
      )
    case 'failed':
      return <Failed answer={answer} />
    case 'no-sql': {
      const plan = answer.plan
      if (!plan) return null
      if (plan.kind === 'clarify' && plan.clarification) {
        return (
          <div className="grid gap-2 text-sm">
            <p>{plan.clarification.question}</p>
            <Chips
              questions={plan.clarification.options.map(
                (option) => `${answer.question} (${option})`,
              )}
            />
          </div>
        )
      }
      return (
        <div className="grid gap-2 text-sm">
          {plan.kind === 'python' && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Info className="size-4" aria-hidden />
              The AI chose Python but sent no code or input query. Try asking again.
            </p>
          )}
          <p>{plan.explanation}</p>
          {plan.alternatives.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">Questions these tables can answer:</p>
              <Chips questions={plan.alternatives} />
            </>
          )}
        </div>
      )
    }
    case 'python':
      // Nothing has run yet, or the last run failed: the code is front and center (F-PY-03).
      return (
        <div className="grid gap-3">
          {answer.plan && <p className="text-sm">{answer.plan.explanation}</p>}
          <PythonPanel answer={answer} />
          <AnswerTabs answer={answer} withTable={false} />
        </div>
      )
    case 'answered':
      return (
        <div className="grid gap-3">
          <AnswerSummaryView answer={answer} />
          <AnswerTabs answer={answer} withTable />
        </div>
      )
  }
}
