import { STAGE_LABELS, type TraceStep } from '@/ai/trace'
import { formatDuration, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'

/** Every attempt: stage, timing, SQL, error and tokens (F-EXPL-06). */
export function TraceTab({ trace }: { trace: TraceStep[] }) {
  const locale = useSettingsStore((state) => state.locale)
  return (
    <ol className="grid gap-2 text-xs">
      {trace.map((step, index) => (
        <li key={index} className="rounded-md border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{STAGE_LABELS[step.stage]}</span>
            <span className="text-muted-foreground">
              {step.stage} · attempt {step.attempt}
            </span>
            <span
              className={cn(
                'rounded px-1.5',
                step.status === 'done' &&
                  'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                step.status === 'error' && 'bg-destructive/10 text-destructive',
                step.status === 'running' && 'bg-muted',
              )}
            >
              {step.status}
            </span>
            {step.ms !== null && (
              <span className="text-muted-foreground tabular-nums">
                {formatDuration(step.ms, locale)}
              </span>
            )}
            {step.usage && (
              <span className="ml-auto text-muted-foreground tabular-nums">
                {formatNumber(step.usage.inputTokens, locale)} in ·{' '}
                {formatNumber(step.usage.outputTokens, locale)} out
                {step.usage.cacheReadTokens > 0 &&
                  ` · ${formatNumber(step.usage.cacheReadTokens, locale)} cached`}
              </span>
            )}
          </div>
          {step.error && <p className="mt-1 text-destructive">{step.error}</p>}
          {/* Each attempt's SQL, once: where it was checked. */}
          {step.sql && step.stage === 'guard' && (
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 font-mono whitespace-pre-wrap">
              {step.sql}
            </pre>
          )}
        </li>
      ))}
    </ol>
  )
}
