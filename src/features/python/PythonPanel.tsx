import { LoaderCircle, Play, ShieldCheck, Square, TriangleAlert, Wrench } from 'lucide-react'
import { lazy, Suspense, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PYTHON_ROW_CAP } from '@/engine/pythonData'
import { useElapsed } from '@/hooks/useElapsed'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { formatDuration, formatNumber } from '@/lib/format'
import type { Answer } from '@/stores/ask'
import {
  canFixPython,
  fixPython,
  isPythonBusy,
  runPythonAnswer,
  setPythonCode,
  stopPython,
} from '@/stores/askPython'
import { useSettingsStore } from '@/stores/settings'

const CodeEditor = lazy(() =>
  import('@/features/python/CodeEditor').then((module) => ({ default: module.CodeEditor })),
)

function Progress({ message, startedAt }: { message: string; startedAt: number | null }) {
  const locale = useSettingsStore((state) => state.locale)
  const elapsed = useElapsed(startedAt ?? 0, startedAt !== null, 250)
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{message}</span>
      {startedAt !== null && (
        <span className="tabular-nums">{formatDuration(elapsed, locale)}</span>
      )}
    </p>
  )
}

/**
 * Python analysis (F-PY-03…05): the generated code, shown before anything runs; Run (the user's
 * approval), Stop, progress while Pyodide loads, stdout, the traceback and one AI fix.
 */
export function PythonPanel({ answer }: { answer: Answer }) {
  const locale = useSettingsStore((state) => state.locale)
  const dark = useResolvedTheme() === 'dark'
  const python = answer.python
  const id = answer.id
  const run = useCallback(() => runPythonAnswer(id), [id])
  if (!python) return null
  const busy = isPythonBusy(python)
  const step = answer.trace.findLast((s) => s.stage === 'python' && s.status === 'running')
  const rows = python.input.rowCount
  const sampled = rows > PYTHON_ROW_CAP

  return (
    <section aria-label="Python analysis" className="grid gap-2 rounded-lg border p-3">
      {python.phase === 'ready' && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            This code runs Python (pandas) on{' '}
            {formatNumber(sampled ? PYTHON_ROW_CAP : rows, locale)} {rows === 1 ? 'row' : 'rows'}{' '}
            from your data
            {sampled ? ` (a random sample of ${formatNumber(rows, locale)})` : ''}, here in your
            browser, with network access turned off. Check it, then run it.
          </span>
        </p>
      )}
      <div className="h-56 overflow-hidden rounded-md border">
        <Suspense fallback={<Skeleton className="m-2 h-40" />}>
          <CodeEditor
            value={python.code}
            onChange={(code) => setPythonCode(id, code)}
            onRun={run}
            dark={dark}
            label="Python code"
            readOnly={busy}
          />
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {busy ? (
          <Button size="sm" variant="outline" onClick={() => stopPython(id)}>
            <Square aria-hidden />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={() => void run()} disabled={!python.code.trim()}>
            <Play aria-hidden />
            {python.phase === 'ready' ? 'Run Python' : 'Run again'}
          </Button>
        )}
        {canFixPython(answer) && (
          <Button size="sm" variant="outline" onClick={() => void fixPython(id)}>
            <Wrench aria-hidden />
            Ask the AI to fix it
          </Button>
        )}
        {python.fixed && python.phase === 'ready' && (
          <span className="text-xs text-muted-foreground">
            The AI fixed the code; run it again.
          </span>
        )}
      </div>
      <div aria-live="polite">
        {busy && (
          <Progress
            message={python.status ?? (python.phase === 'loading' ? 'Loading Python…' : 'Running…')}
            startedAt={step?.startedAt ?? null}
          />
        )}
        {!busy && python.status && <p className="text-xs text-muted-foreground">{python.status}</p>}
      </div>
      {python.error && !busy && (
        <div role="alert" className="grid gap-1">
          <p className="flex items-center gap-1.5 text-sm">
            <TriangleAlert className="size-4 text-destructive" aria-hidden />
            {python.phase === 'stopped'
              ? python.error.split('. ')[0] + '.'
              : 'The Python code failed.'}
          </p>
          <pre className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
            {python.error}
          </pre>
        </div>
      )}
      {python.stdout && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">Output (print)</summary>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
            {python.stdout}
          </pre>
        </details>
      )}
    </section>
  )
}
