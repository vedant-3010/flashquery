import { lazy, Suspense, useState } from 'react'
import type { ChartSpec } from '@/charts/spec'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExplanationTab } from '@/features/explain/ExplanationTab'
import { SqlTab } from '@/features/explain/SqlTab'
import { TraceTab } from '@/features/explain/TraceTab'
import { ResultGrid } from '@/features/grid/ResultGrid'
import { PythonPanel } from '@/features/python/PythonPanel'
import { toAppError } from '@/lib/errors'
import { useAskStore, type Answer } from '@/stores/ask'

const ChartPanel = lazy(() =>
  import('@/features/charts/ChartPanel').then((module) => ({ default: module.ChartPanel })),
)

/** Fits small results (28 px rows plus header and footer), up to 320 px. */
const gridHeight = (rows: number) => Math.min(320, Math.max(3, rows) * 28 + 72)

/** Chart | Table | SQL | Explanation | Trace (F-ASK-08). Failed answers show SQL and Trace. */
export function AnswerTabs({ answer, withTable }: { answer: Answer; withTable: boolean }) {
  const setChart = useAskStore((state) => state.setChart)
  const chart = withTable ? answer.chart : null
  const python = answer.python
  const [tab, setTab] = useState(
    chart && chart.spec.type !== 'table' ? 'chart' : withTable ? 'table' : python ? 'input' : 'sql',
  )
  const [pending, setPending] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)

  const changeChart = (spec: ChartSpec) => {
    setPending(true)
    setChartError(null)
    setChart(answer.id, spec)
      .catch((error: unknown) => setChartError(toAppError(error).message))
      .finally(() => setPending(false))
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-2">
      <TabsList variant="line" aria-label="Answer details">
        {chart && <TabsTrigger value="chart">Chart</TabsTrigger>}
        {withTable && <TabsTrigger value="table">Table</TabsTrigger>}
        {python && withTable && <TabsTrigger value="python">Python</TabsTrigger>}
        {python && <TabsTrigger value="input">Input data</TabsTrigger>}
        {answer.sql !== null && (
          <TabsTrigger value="sql">{python ? 'Input SQL' : 'SQL'}</TabsTrigger>
        )}
        {answer.plan && <TabsTrigger value="explanation">Explanation</TabsTrigger>}
        <TabsTrigger value="trace">Trace</TabsTrigger>
      </TabsList>
      {chart && answer.result && (
        <TabsContent value="chart">
          <Suspense fallback={<Skeleton className="h-72 w-full" />}>
            <ChartPanel
              spec={chart.spec}
              data={chart.data}
              columns={answer.result.columns}
              rows={answer.rows}
              rowCount={answer.result.rowCount}
              question={answer.question}
              auto={chart.auto}
              picked={answer.chartPicked}
              onChange={changeChart}
              onViewTable={() => setTab('table')}
              loading={pending}
            />
          </Suspense>
          {chartError && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {chartError}
            </p>
          )}
        </TabsContent>
      )}
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
      {python && withTable && (
        <TabsContent value="python">
          <PythonPanel answer={answer} />
        </TabsContent>
      )}
      {python && (
        <TabsContent value="input">
          <div
            className="flex flex-col overflow-hidden rounded-md border"
            style={{ height: gridHeight(python.input.rowCount) }}
          >
            <ResultGrid
              key={python.input.relation}
              result={python.input}
              label={`Python input: ${answer.question}`}
              exportName="python_input"
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
          <ExplanationTab plan={answer.plan} chart={chart?.spec ?? null} />
        </TabsContent>
      )}
      <TabsContent value="trace">
        <TraceTab trace={answer.trace} />
      </TabsContent>
    </Tabs>
  )
}
