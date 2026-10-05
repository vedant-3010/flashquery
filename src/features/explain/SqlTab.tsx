import { ClipboardCopy, Play } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryPlanPanel } from '@/features/explain/QueryPlanPanel'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { toAppError } from '@/lib/errors'
import { useAskStore, type Answer } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'

const SqlEditor = lazy(() =>
  import('@/features/sql/SqlEditor').then((module) => ({ default: module.SqlEditor })),
)

/**
 * The answer's SQL (F-EXPL-01): formatted, highlighted, copyable, and editable. Run sends the edit
 * through the same guard as generated SQL; the answer is then marked "edited". Below it, the query
 * plan with timings (F-EXPL-09).
 */
export function SqlTab({ answer }: { answer: Answer }) {
  const runEditedSql = useAskStore((state) => state.runEditedSql)
  const datasets = useDatasetsStore((state) => state.datasets)
  const dark = useResolvedTheme() === 'dark'
  const original = answer.sql ?? ''
  const [draft, setDraft] = useState(original)
  // Read by the Mod-Enter handler, which must stay stable for the editor.
  const draftRef = useRef(original)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  // Show the SQL formatted (sql-formatter loads on demand).
  useEffect(() => {
    let active = true
    import('sql-formatter')
      .then(({ format }) => format(original, { language: 'duckdb', keywordCase: 'upper' }))
      .then((formatted) => {
        if (!active || draftRef.current !== original) return
        draftRef.current = formatted
        setDraft(formatted)
      })
      .catch(() => undefined) // Unformattable SQL is shown as written.
    return () => {
      active = false
    }
  }, [original])

  const change = (value: string) => {
    draftRef.current = value
    setDraft(value)
  }

  const run = useCallback(async () => {
    setRunning(true)
    setError(null)
    try {
      await runEditedSql(answer.id, draftRef.current)
    } catch (caught) {
      setError(toAppError(caught).message)
    } finally {
      setRunning(false)
    }
  }, [answer.id, runEditedSql])

  const schema = useMemo(
    () => Object.fromEntries(datasets.map((d) => [d.table, d.columns.map((c) => c.name)])),
    [datasets],
  )

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5">
        <Button size="xs" onClick={() => void run()} disabled={running || draft.trim() === ''}>
          <Play aria-hidden />
          {running ? 'Running…' : 'Run'}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(draftRef.current).then(() => setCopied(true))
          }}
        >
          <ClipboardCopy aria-hidden />
          {copied ? 'Copied' : 'Copy SQL'}
        </Button>
        {answer.edited && <Badge variant="secondary">Edited</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">
          Edits are checked like generated SQL before they run.
        </span>
      </div>
      <div className="h-48 overflow-hidden rounded-md border">
        <Suspense fallback={<Skeleton className="m-2 h-24" />}>
          <SqlEditor
            value={draft}
            onChange={change}
            onRun={run}
            schema={schema}
            defaultTable={answer.tables.length === 1 ? answer.tables[0] : undefined}
            dark={dark}
            placeholder="SELECT …"
          />
        </Suspense>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {/* The SQL that ran (already checked by the guard), not the draft. */}
      <QueryPlanPanel sql={answer.result ? answer.sql : null} />
    </div>
  )
}
