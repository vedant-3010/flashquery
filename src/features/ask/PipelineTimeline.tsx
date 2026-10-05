import { Ban, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import type { TraceStep } from '@/ai/trace'
import { STAGE_LABELS } from '@/ai/trace'
import { useElapsed } from '@/hooks/useElapsed'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'

// F-ASK-06: "Reading schema 12 ms · Writing SQL 1.8 s · Checking SQL 40 ms · Running 84 ms …".
// Guard + EXPLAIN show as one "Checking SQL" item; later attempts read "Fixing SQL".

interface Item {
  /** Unique: explorations (F-ASK-15) mean a stage can repeat within one attempt. */
  key: string
  /** stage-attempt, to fold EXPLAIN into its guard check. */
  group: string
  label: string
  status: TraceStep['status']
  startedAt: number
  ms: number | null
}

function items(trace: TraceStep[]): Item[] {
  const out: Item[] = []
  trace.forEach((step, index) => {
    if (step.stage === 'explain') {
      const check = out.at(-1)
      if (check && check.group === `guard-${step.attempt}`) {
        check.status = step.status
        check.ms = (check.ms ?? 0) + (step.ms ?? 0)
        return
      }
    }
    const label =
      step.stage === 'plan' && step.attempt > 1
        ? `Fixing SQL (${step.attempt})`
        : STAGE_LABELS[step.stage]
    out.push({
      key: `${step.stage}-${step.attempt}-${index}`,
      group: `${step.stage}-${step.attempt}`,
      label,
      status: step.status,
      startedAt: step.startedAt,
      ms: step.ms,
    })
  })
  return out
}

const ICONS = {
  running: LoaderCircle,
  done: CircleCheck,
  error: CircleX,
  cancelled: Ban,
} as const

function Duration({ item, locale }: { item: Item; locale: string }) {
  const elapsed = useElapsed(item.startedAt, item.status === 'running', 100)
  return <span className="tabular-nums">{formatDuration(item.ms ?? elapsed, locale)}</span>
}

export function PipelineTimeline({ trace }: { trace: TraceStep[] }) {
  const locale = useSettingsStore((state) => state.locale)
  if (trace.length === 0) return null
  return (
    <ol
      aria-label="Progress"
      className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
    >
      {items(trace).map((item) => {
        const Icon = ICONS[item.status]
        return (
          <li key={item.key} className="inline-flex items-center gap-1">
            <Icon
              aria-hidden
              className={cn(
                'size-3.5',
                item.status === 'running' && 'animate-spin text-primary motion-reduce:animate-none',
                item.status === 'done' && 'text-emerald-600 dark:text-emerald-400',
                item.status === 'error' && 'text-destructive',
              )}
            />
            <span className={cn(item.status === 'running' && 'text-foreground')}>{item.label}</span>
            <Duration item={item} locale={locale} />
            <span className="sr-only">{item.status}</span>
          </li>
        )
      })}
    </ol>
  )
}
