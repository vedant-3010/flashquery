import { ListTree } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getDb } from '@/engine/duckdb'
import { explainAnalyze, type PlanNode, type QueryPlan } from '@/engine/queryPlan'
import { toAppError } from '@/lib/errors'
import { formatDuration, formatNumber, humanizeName } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

function NodeRow({ node, total, locale }: { node: PlanNode; total: number; locale: string }) {
  const share = total > 0 ? node.timingMs / total : 0
  return (
    <li className="grid gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{humanizeName(node.name.toLowerCase())}</span>
        <span className="text-muted-foreground tabular-nums">
          {formatDuration(node.timingMs, locale)} · {formatNumber(node.rows, locale)}{' '}
          {node.rows === 1 ? 'row' : 'rows'}
          {node.rowsScanned > 0 && ` · ${formatNumber(node.rowsScanned, locale)} scanned`}
        </span>
      </div>
      <div className="h-1 w-full max-w-64 rounded bg-muted" aria-hidden>
        <div
          className="h-1 rounded bg-primary/60"
          style={{ width: `${Math.max(1, Math.round(share * 100))}%` }}
        />
      </div>
      {node.details.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-[11px] text-muted-foreground">
          {node.details.map((detail) => (
            <div key={detail.label} className="contents">
              <dt>{detail.label}</dt>
              <dd className="font-mono break-all">{detail.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {node.children.length > 0 && (
        <ul className="mt-1 grid gap-2 border-l pl-3">
          {node.children.map((child, index) => (
            <NodeRow key={index} node={child} total={total} locale={locale} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The query plan with timings (F-EXPL-09), from EXPLAIN ANALYZE. It runs the query once more, so
 * it's loaded on request.
 */
export function QueryPlanPanel({ sql }: { sql: string | null }) {
  const locale = useSettingsStore((state) => state.locale)
  const [state, setState] = useState<
    | { sql: string; status: 'loading' }
    | { sql: string; status: 'done'; plan: QueryPlan }
    | { sql: string; status: 'error'; message: string }
    | null
  >(null)
  const current = state?.sql === sql ? state : null

  const load = () => {
    if (!sql) return
    setState({ sql, status: 'loading' })
    getDb()
      .then((engine) => explainAnalyze(engine, sql, AbortSignal.timeout(30_000)))
      .then((plan) => setState({ sql, status: 'done', plan }))
      .catch((error: unknown) =>
        setState({ sql, status: 'error', message: toAppError(error).message }),
      )
  }

  if (!sql) return null
  return (
    <section aria-label="Query plan" className="grid gap-2 text-xs">
      <div className="flex items-center gap-2">
        <Button size="xs" variant="outline" disabled={current?.status === 'loading'} onClick={load}>
          <ListTree aria-hidden />
          {current?.status === 'done' ? 'Run the plan again' : 'Show query plan'}
        </Button>
        {current?.status === 'done' && (
          <span className="text-muted-foreground tabular-nums">
            Ran in {formatDuration(current.plan.totalMs, locale)}; operators{' '}
            {formatDuration(current.plan.operatorMs, locale)}. Bars show each operator&apos;s share.
          </span>
        )}
        {!current && (
          <span className="text-muted-foreground">
            Runs the query once more with EXPLAIN ANALYZE to time each step.
          </span>
        )}
      </div>
      {current?.status === 'loading' && <Skeleton className="h-24 w-full" />}
      {current?.status === 'error' && (
        <p role="alert" className="text-destructive">
          {current.message}
        </p>
      )}
      {current?.status === 'done' && current.plan.root && (
        <ul className="grid max-h-96 gap-2 overflow-y-auto rounded-md border p-2">
          <NodeRow node={current.plan.root} total={current.plan.operatorMs} locale={locale} />
        </ul>
      )}
    </section>
  )
}
