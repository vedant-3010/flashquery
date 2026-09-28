import { Play, Square, SquareTerminal, TriangleAlert, WandSparkles } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { prefetchCharts } from '@/features/charts/prefetch'
import { useAutoChart } from '@/features/charts/useAutoChart'
import { ResultGrid } from '@/features/grid/ResultGrid'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { formatDuration, formatNumber } from '@/lib/format'
import { useDatasetsStore } from '@/stores/datasets'
import { useSettingsStore } from '@/stores/settings'
import { useSqlStore } from '@/stores/sql'

const SqlEditor = lazy(() =>
  import('@/features/sql/SqlEditor').then((module) => ({ default: module.SqlEditor })),
)

const ChartPanel = lazy(() =>
  import('@/features/charts/ChartPanel').then((module) => ({ default: module.ChartPanel })),
)

const RUN_SHORTCUT = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘↵' : 'Ctrl+↵'

/** SQL scratchpad: query loaded tables directly; results in the grid or a chart (F-EXPL-07). */
export function SqlView() {
  const { text, running, result, error, elapsedMs, setText, run, cancel } = useSqlStore()
  const datasets = useDatasetsStore((state) => state.datasets)
  const locale = useSettingsStore((state) => state.locale)
  const dark = useResolvedTheme() === 'dark'
  const [showDetails, setShowDetails] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [resultView, setResultView] = useState<'grid' | 'chart'>('grid')
  const auto = useAutoChart(result, resultView === 'chart')

  const schema = useMemo(
    () =>
      Object.fromEntries(
        datasets.map((dataset) => [dataset.table, dataset.columns.map((column) => column.name)]),
      ),
    [datasets],
  )
  // Columns of the table in FROM (or of the only table) complete without a prefix.
  const fromTable = /\bfrom\s+"?([a-z_][a-z0-9_]*)"?/i.exec(text)?.[1]?.toLowerCase()
  const defaultTable =
    fromTable && fromTable in schema
      ? fromTable
      : datasets.length === 1
        ? datasets[0]?.table
        : undefined
  const placeholder = datasets[0]
    ? `SELECT * FROM ${datasets[0].table} LIMIT 100`
    : 'Load a dataset, then query it here'

  const format = async () => {
    setFormatError(null)
    try {
      const { format: formatSql } = await import('sql-formatter')
      setText(formatSql(text, { language: 'duckdb', keywordCase: 'upper' }))
    } catch {
      setFormatError("Couldn't format this query (is it valid SQL?)")
    }
  }

  let status = formatError ?? ''
  if (!formatError && running) status = 'Running…'
  else if (!formatError && result && elapsedMs !== null) {
    status = `${formatNumber(result.rowCount, locale)} rows · ${formatDuration(elapsedMs, locale)}`
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
        {running ? (
          <Button size="sm" variant="outline" onClick={cancel}>
            <Square aria-hidden />
            Cancel
          </Button>
        ) : (
          <Button size="sm" onClick={() => void run()} disabled={text.trim() === ''}>
            <Play aria-hidden />
            Run
            <kbd className="ml-1 text-[10px] opacity-70">{RUN_SHORTCUT}</kbd>
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void format()} disabled={!text.trim()}>
          <WandSparkles aria-hidden />
          Format
        </Button>
        <span aria-live="polite" className="ml-auto truncate text-xs text-muted-foreground">
          {status}
        </span>
      </div>

      <div className="h-[36%] min-h-28 shrink-0 overflow-hidden border-b">
        <Suspense fallback={<Skeleton className="m-3 h-20" />}>
          <SqlEditor
            value={text}
            onChange={setText}
            onRun={run}
            schema={schema}
            defaultTable={defaultTable}
            dark={dark}
            placeholder={placeholder}
          />
        </Suspense>
      </div>

      {error && (
        <div role="alert" className="shrink-0 border-b bg-destructive/5 px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p className="min-w-0 flex-1">{error.message}</p>
            {error.detail && (
              <Button size="xs" variant="ghost" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? 'Hide details' : 'Show details'}
              </Button>
            )}
          </div>
          {showDetails && error.detail && (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
              {error.detail}
            </pre>
          )}
        </div>
      )}

      {result ? (
        <Tabs
          value={resultView}
          onValueChange={(value) => setResultView(value === 'chart' ? 'chart' : 'grid')}
          onPointerEnter={prefetchCharts}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="flex h-9 shrink-0 items-center border-b px-2">
            <TabsList variant="line" aria-label="Show results as">
              <TabsTrigger value="grid">Grid</TabsTrigger>
              <TabsTrigger value="chart">Chart</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="grid" className="flex min-h-0 flex-col">
            <ResultGrid
              key={result.relation}
              result={result}
              label="Query results"
              exportName="query_result"
            />
          </TabsContent>
          <TabsContent value="chart" className="min-h-0 overflow-y-auto p-3">
            {auto.chart ? (
              <Suspense fallback={<Skeleton className="h-72 w-full" />}>
                <ChartPanel
                  key={result.relation}
                  spec={auto.chart.spec}
                  data={auto.chart.data}
                  columns={result.columns}
                  rows={auto.chart.rows}
                  rowCount={result.rowCount}
                  auto={auto.chart.auto}
                  picked={auto.chart.spec !== auto.chart.auto}
                  onChange={(spec) => void auto.setSpec(spec)}
                  onViewTable={() => setResultView('grid')}
                />
              </Suspense>
            ) : auto.error ? (
              <p role="alert" className="text-sm text-destructive">
                The chart couldn't be drawn: {auto.error}
              </p>
            ) : (
              <Skeleton className="h-72 w-full" />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState
          icon={SquareTerminal}
          title="Query your tables with SQL"
          description={`DuckDB SQL, running on this device. Press ${RUN_SHORTCUT} to run.`}
        />
      )}
    </div>
  )
}
