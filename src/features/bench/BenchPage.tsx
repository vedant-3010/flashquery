import { ArrowLeft, ClipboardCopy, Gauge } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BENCH_TABLE,
  benchMarkdown,
  dropBenchTables,
  runEngineBench,
  type BenchResult,
} from '@/engine/bench'
import { getDb, getEngineState } from '@/engine/duckdb'
import {
  measureChartRender,
  measureGridScroll,
  measureMemory,
  pageTimings,
} from '@/features/bench/browserBench'
import { TableGrid } from '@/features/grid/TableGrid'
import { toAppError } from '@/lib/errors'
import { formatNumber } from '@/lib/format'

const SIZES = { '1000000': '1M rows (the §5 budgets)', '100000': '100k rows (quick)' }

function format(result: BenchResult): string {
  if (result.value === null) return 'n/a'
  if (result.id.startsWith('memory'))
    return `${formatNumber(result.value, 'en-US', { maxFractionDigits: 0 })} MB`
  return result.value >= 1000
    ? `${(result.value / 1000).toFixed(2)} s`
    : `${result.value.toFixed(result.value < 10 ? 1 : 0)} ms`
}

function environment(rows: number): string {
  const browser = /(Edg|Firefox|Chrome|Safari)\/[\d.]+/.exec(navigator.userAgent)?.[0] ?? 'Browser'
  const version = getEngineState().version ?? ''
  return `AskData bench · ${new Date().toISOString().slice(0, 10)} · ${browser} · ${navigator.hardwareConcurrency} cores · DuckDB-WASM ${version} · ${rows.toLocaleString('en-US')} rows`
}

/** `#/bench` (F-PERF-04): measures the PRD §5 budgets on this device. */
export function BenchPage() {
  const [rows, setRows] = useState(1_000_000)
  const [readyAt, setReadyAt] = useState<number | null>(null)
  const [step, setStep] = useState<string | null>(null)
  const [results, setResults] = useState<BenchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [gridReady, setGridReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const gridHost = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getDb()
      .then(() => setReadyAt(performance.now()))
      .catch((caught: unknown) => setError(toAppError(caught).message))
  }, [])

  const run = async () => {
    setResults(null)
    setError(null)
    setCopied(false)
    try {
      const engine = await getDb()
      const measured = [...pageTimings(readyAt)]
      measured.push(...(await runEngineBench(engine, { rows, onStep: setStep })))
      setStep('Rendering a chart')
      measured.push(await measureChartRender())
      setStep('Scrolling the grid')
      setGridReady(true)
      // Wait for the grid to open the table and paint.
      let scroller: HTMLElement | null = null
      for (let i = 0; i < 100 && !scroller; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        scroller = gridHost.current?.querySelector<HTMLElement>('[role="grid"]') ?? null
      }
      if (scroller) measured.push(await measureGridScroll(scroller, rows))
      measured.push(...(await measureMemory(engine)))
      setGridReady(false)
      await dropBenchTables(engine)
      setResults(measured)
    } catch (caught) {
      setError(toAppError(caught).message)
      setGridReady(false)
    } finally {
      setStep(null)
    }
  }

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 text-sm">
      <header className="grid gap-2">
        <a
          href="#/"
          className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to AskData
        </a>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Gauge className="size-5" aria-hidden />
          Benchmark
        </h1>
        <p className="text-muted-foreground">
          Measures AskData on this device against its performance budgets. Data is generated here;
          nothing is sent anywhere. The 1M-row run uses a few hundred MB of memory for a minute.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(rows)} onValueChange={(value) => setRows(Number(value))}>
          <SelectTrigger aria-label="Rows" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SIZES).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => void run()} disabled={step !== null || readyAt === null}>
          {step ? `${step}…` : readyAt === null ? 'Starting DuckDB…' : 'Run benchmark'}
        </Button>
        {results && (
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard
                .writeText(benchMarkdown(results, environment(rows)))
                .then(() => setCopied(true))
                .catch((caught: unknown) => setError(toAppError(caught).message))
            }}
          >
            <ClipboardCopy aria-hidden />
            {copied ? 'Copied' : 'Copy as Markdown'}
          </Button>
        )}
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {results && (
        <table aria-label="Benchmark results" className="w-full text-left">
          <caption className="pb-2 text-left text-xs text-muted-foreground">
            {environment(rows)}
          </caption>
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Metric</th>
              <th className="py-1 text-right font-medium">Result</th>
              <th className="py-1 text-right font-medium">Budget</th>
              <th className="py-1 font-medium">
                <span className="sr-only">Within budget</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const ok =
                result.budget === null || result.value === null
                  ? null
                  : result.value <= result.budget
              return (
                <tr key={result.id} className="border-b border-border/60">
                  <td className="py-1.5">
                    {result.label}
                    {result.detail && (
                      <span className="block text-xs text-muted-foreground">{result.detail}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{format(result)}</td>
                  <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                    {result.budget === null
                      ? '—'
                      : `≤ ${format({ ...result, value: result.budget })}`}
                  </td>
                  <td className="py-1.5 pl-3">
                    {ok === null ? '' : ok ? '✅ within budget' : '❌ over budget'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {gridReady && (
        <div ref={gridHost} className="flex h-96 flex-col overflow-hidden rounded-md border">
          <TableGrid table={BENCH_TABLE} />
        </div>
      )}
    </main>
  )
}
