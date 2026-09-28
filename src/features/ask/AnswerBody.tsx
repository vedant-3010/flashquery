import { Info, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExplanationTab } from '@/features/explain/ExplanationTab'
import { SqlTab } from '@/features/explain/SqlTab'
import { TraceTab } from '@/features/explain/TraceTab'
import { ResultGrid } from '@/features/grid/ResultGrid'
import { useAskStore, type Answer } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { useUiStore } from '@/stores/ui'

/** Fits small results (28 px rows plus header and footer), up to 320 px. */
const gridHeight = (rows: number) => Math.min(320, Math.max(3, rows) * 28 + 72)

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

function AnswerTabs({ answer, withTable }: { answer: Answer; withTable: boolean }) {
  const [tab, setTab] = useState(withTable ? 'table' : 'sql')
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-2">
      <TabsList variant="line" aria-label="Answer details">
        {withTable && <TabsTrigger value="table">Table</TabsTrigger>}
        {answer.sql !== null && <TabsTrigger value="sql">SQL</TabsTrigger>}
        {answer.plan && <TabsTrigger value="explanation">Explanation</TabsTrigger>}
        <TabsTrigger value="trace">Trace</TabsTrigger>
      </TabsList>
      {withTable && answer.result && (
        <TabsContent value="table">
          <div
            className="flex flex-col overflow-hidden rounded-md border"
            style={{ height: gridHeight(answer.result.rowCount) }}
          >
            <ResultGrid
              key={answer.result.relation}
              result={answer.result}
              label={`Result: ${answer.question}`}
              exportName="answer"
            />
          </div>
        </TabsContent>
      )}
      {answer.sql !== null && (
        <TabsContent value="sql">
          <SqlTab answer={answer} />
        </TabsContent>
      )}
      {answer.plan && (
        <TabsContent value="explanation">
          <ExplanationTab plan={answer.plan} />
        </TabsContent>
      )}
      <TabsContent value="trace">
        <TraceTab trace={answer.trace} />
      </TabsContent>
    </Tabs>
  )
}

function Failed({ answer }: { answer: Answer }) {
  const [showDetails, setShowDetails] = useState(false)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const loadSample = useDatasetsStore((state) => state.loadSample)
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
      {error.code === 'demo_unmatched' && <Chips questions={DEMO_QUESTIONS} />}
      {(error.code === 'demo_unmatched' || error.code === 'demo_needs_sample') && (
        <div className="flex flex-wrap gap-2">
          {error.code === 'demo_needs_sample' && (
            <Button size="sm" onClick={() => loadSample('global-sales-1m')}>
              Load Global Sales (1M rows)
            </Button>
          )}
          <Button
            size="sm"
            variant={error.code === 'demo_unmatched' ? 'default' : 'outline'}
            onClick={() => openSettings(true)}
          >
            <KeyRound aria-hidden />
            Add an API key to ask anything
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
              This needs Python (statistics or forecasting), which arrives in a later version.
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
    case 'answered':
      return (
        <div className="grid gap-3">
          {answer.summary && (
            <div className="grid gap-1">
              <p className="text-base font-medium">{answer.summary.headline}</p>
              {answer.summary.bullets.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {answer.summary.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
              {answer.summary.caveats.map((caveat) => (
                <p key={caveat} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="size-3.5" aria-hidden />
                  {caveat}
                </p>
              ))}
            </div>
          )}
          <AnswerTabs answer={answer} withTable />
        </div>
      )
  }
}
