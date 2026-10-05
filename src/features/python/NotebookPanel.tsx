import { Database, Play, Plus, Square, Trash2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useState } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDatasetsStore } from '@/stores/datasets'
import { useNotebookStore, type NotebookCell } from '@/stores/notebook'
import { useSettingsStore } from '@/stores/settings'
import { useSqlStore } from '@/stores/sql'
import type { NotebookValue } from '@/workers/notebook'

const CodeEditor = lazy(() =>
  import('@/features/python/CodeEditor').then((module) => ({ default: module.CodeEditor })),
)

const RESULT = '__result__'

function ValueView({ value, locale }: { value: NotebookValue; locale: string }) {
  if (value.kind === 'text') {
    return (
      <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
        {value.text}
      </pre>
    )
  }
  return (
    <div className="grid gap-1">
      <div className="max-h-72 overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {value.columns.map((column) => (
                <th key={column} className="px-2 py-1 text-left font-mono font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, i) => (
              <tr key={i} className="border-t border-border/60">
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-0.5 whitespace-nowrap tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {value.totalRows > value.rows.length && (
        <p className="text-xs text-muted-foreground">
          First {value.rows.length} of {formatNumber(value.totalRows, locale)} rows.
        </p>
      )}
    </div>
  )
}

function CellView({ cell, index }: { cell: NotebookCell; index: number }) {
  const locale = useSettingsStore((state) => state.locale)
  const dark = useResolvedTheme() === 'dark'
  const { setCode, runCell, removeCell, addCell, stop } = useNotebookStore()
  const busy = useNotebookStore((state) => state.running !== null)
  const run = useCallback(() => void runCell(cell.id), [runCell, cell.id])
  const lines = Math.min(16, Math.max(3, cell.code.split('\n').length + 1))
  const result = cell.result

  return (
    <section aria-label={`Cell ${index + 1}`} className="grid gap-2 rounded-lg border p-2">
      <div className="flex items-center gap-1.5">
        <span className="w-10 font-mono text-xs text-muted-foreground tabular-nums">
          [{cell.status === 'running' ? '*' : (cell.count ?? ' ')}]
        </span>
        {cell.status === 'running' ? (
          <Button size="xs" variant="outline" onClick={stop}>
            <Square aria-hidden />
            Stop
          </Button>
        ) : (
          <Button size="xs" onClick={run} disabled={busy || cell.code.trim() === ''}>
            <Play aria-hidden />
            Run
          </Button>
        )}
        <span className="ml-auto" />
        <IconButton
          label={`Add a cell after cell ${index + 1}`}
          size="icon-xs"
          onClick={() => addCell(cell.id)}
        >
          <Plus />
        </IconButton>
        <IconButton
          label={`Delete cell ${index + 1}`}
          size="icon-xs"
          disabled={busy}
          onClick={() => removeCell(cell.id)}
        >
          <Trash2 />
        </IconButton>
      </div>
      <div
        className="overflow-hidden rounded-md border"
        style={{ height: `${lines * 1.35 + 0.8}rem` }}
      >
        <Suspense fallback={<Skeleton className="m-2 h-12" />}>
          <CodeEditor
            value={cell.code}
            onChange={(code) => setCode(cell.id, code)}
            onRun={run}
            dark={dark}
            label={`Code of cell ${index + 1}`}
          />
        </Suspense>
      </div>
      {result && (
        <div aria-label={`Output of cell ${index + 1}`} role="region" className="grid gap-2">
          {result.stdout && (
            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
              {result.stdout}
            </pre>
          )}
          {result.error && (
            <pre
              role="alert"
              className="max-h-64 overflow-auto rounded bg-destructive/5 p-2 font-mono text-xs whitespace-pre-wrap text-destructive"
            >
              {result.error}
            </pre>
          )}
          {result.value && <ValueView value={result.value} locale={locale} />}
          {result.figures.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Figure ${i + 1} from cell ${index + 1}`}
              className="max-w-full rounded border bg-white"
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Notebook-style Python in the scratchpad (F-PY-06): cells share one session; `df` comes from a
 * table or the last SQL result; matplotlib figures appear under their cell.
 */
export function NotebookPanel() {
  const locale = useSettingsStore((state) => state.locale)
  const datasets = useDatasetsStore((state) => state.datasets)
  const hasResult = useSqlStore((state) => state.result !== null)
  const { cells, data, loading, error, loadData, addCell } = useNotebookStore()
  const [source, setSource] = useState<string>('')
  const chosen = source || (hasResult ? RESULT : (datasets[0]?.table ?? ''))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-4xl gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
          <span className="text-xs font-medium">df from</span>
          <Select value={chosen} onValueChange={setSource}>
            <SelectTrigger size="sm" className="w-56" aria-label="Load df from">
              <SelectValue placeholder="Load a dataset first" />
            </SelectTrigger>
            <SelectContent>
              {hasResult && <SelectItem value={RESULT}>The last SQL result</SelectItem>}
              {datasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.table}>
                  {dataset.table}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!chosen || loading !== null}
            onClick={() =>
              void loadData(
                chosen === RESULT ? { kind: 'result' } : { kind: 'table', table: chosen },
              )
            }
          >
            <Database aria-hidden />
            Load into df
          </Button>
          <span
            role="status"
            className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
          >
            {loading ??
              error ??
              (data
                ? `df: ${formatNumber(data.rows, locale)} rows from ${data.label}${data.sampled ? ' (a sample)' : ''}`
                : 'Python loads on first use (about 12 MB, cached).')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Your own code, run in this browser. Packages your code imports download first (matplotlib,
          scikit-learn…); then the network is off while a cell runs. Ctrl/Cmd+Enter runs a cell.
        </p>
        {cells.map((cell, index) => (
          <CellView key={cell.id} cell={cell} index={index} />
        ))}
        <Button size="sm" variant="outline" className="w-fit" onClick={() => addCell()}>
          <Plus aria-hidden />
          Add cell
        </Button>
      </div>
    </div>
  )
}
