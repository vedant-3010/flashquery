import { useMemo } from 'react'
import type { AiLogEntry } from '@/ai/log'
import { totalUsage } from '@/ai/cost'
import { formatNumber, formatUsd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'

/** Tokens and estimated cost of some AI requests (F-AI-04). Renders nothing without usage. */
export function UsageSummary({
  entries,
  label,
  className,
}: {
  entries: readonly AiLogEntry[]
  label: string
  className?: string
}) {
  const locale = useSettingsStore((state) => state.locale)
  const total = useMemo(() => totalUsage([...entries]), [entries])
  if (total.inputTokens + total.outputTokens === 0) return null

  const tokens = formatNumber(total.inputTokens + total.outputTokens, locale)
  const cost =
    total.cost === null ? null : `≈ ${formatUsd(total.cost, locale)}${total.partial ? '+' : ''}`
  return (
    <p
      className={cn('text-xs text-muted-foreground tabular-nums', className)}
      title={`${formatNumber(total.inputTokens, locale)} input + ${formatNumber(total.outputTokens, locale)} output tokens. Cost is an upper-bound estimate from list prices; your provider's bill is the source of truth.`}
    >
      {label}: {tokens} tokens{cost && ` · ${cost}`}
    </p>
  )
}
