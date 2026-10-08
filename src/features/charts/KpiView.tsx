import type { Prepared } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { chartTheme } from '@/charts/theme'
import { useChartPalette } from '@/features/charts/chartPalette'
import { Sparkline } from '@/features/charts/Sparkline'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { formatTimePoint, formatValue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'

type KpiData = Extract<Prepared, { kind: 'kpi' }>
type Item = KpiData['items'][number]

const PERCENT = { y: 'percent' as const, currency: null }

/** "▲ 8.2%" / "▼ 3%" / "= 0%", with the direction in words for screen readers. */
function Change({ item, since, locale }: { item: Item; since: string | null; locale: string }) {
  const { value, previous } = item
  if (value === null || previous === null || previous === undefined || previous === 0) return null
  const ratio = (value - previous) / Math.abs(previous)
  const size = formatValue(Math.abs(ratio), PERCENT, locale)
  const direction = ratio > 0 ? 'up' : ratio < 0 ? 'down' : 'unchanged'
  return (
    <p className="flex items-center gap-1 text-xs tabular-nums">
      <span
        className={cn(
          'font-medium',
          ratio > 0 && 'text-emerald-700 dark:text-emerald-400',
          ratio < 0 && 'text-rose-700 dark:text-rose-400',
        )}
      >
        <span aria-hidden>{ratio > 0 ? '▲' : ratio < 0 ? '▼' : '='} </span>
        <span className="sr-only">{direction} </span>
        {size}
      </span>
      {since && <span className="text-muted-foreground">vs {since}</span>}
    </p>
  )
}

/** One big number per measure (F-VIZ-02 KPI and KPI group); over time, with its trend (F-VIZ-10). */
export function KpiView({
  spec,
  prepared,
  compact = false,
}: {
  spec: ChartSpec
  prepared: KpiData
  /** Inside a dashboard tile: no card border, smaller numbers. */
  compact?: boolean
}) {
  const locale = useSettingsStore((state) => state.locale)
  const accent = chartTheme(useResolvedTheme(), useChartPalette(spec)).palette[0]
  const { period } = prepared
  const step =
    period && typeof period.latest === 'number' && typeof period.previous === 'number'
      ? period.latest - period.previous
      : 86_400_000
  const when = (at: number | string | null | undefined) =>
    at === null || at === undefined
      ? null
      : typeof at === 'number'
        ? formatTimePoint(at, locale, step)
        : at
  return (
    <div className="grid gap-2">
      {prepared.caption && <p className="text-xs text-muted-foreground">{prepared.caption}</p>}
      {period && <p className="text-xs text-muted-foreground">Latest: {when(period.latest)}</p>}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
        {prepared.items.map((item) => {
          const short = formatValue(item.value, spec.format, locale, { compact: true })
          const full = formatValue(item.value, spec.format, locale)
          return (
            <li key={item.label} className={compact ? 'min-w-0' : 'rounded-lg border p-4'}>
              {/* A tile's title already names a single KPI. */}
              {!(compact && prepared.items.length === 1) && (
                <p className="text-xs text-muted-foreground">{item.label}</p>
              )}
              <p
                className={`${compact ? 'text-2xl' : 'text-3xl'} truncate font-semibold tracking-tight tabular-nums`}
                title={full}
              >
                {short}
              </p>
              {short !== full && !item.trend && (
                <p className="text-xs text-muted-foreground tabular-nums">{full}</p>
              )}
              {item.trend && (
                <div className="mt-1 grid gap-1">
                  <Change item={item} since={when(period?.previous)} locale={locale} />
                  <span style={{ color: accent }}>
                    <Sparkline values={item.trend} className="h-7 w-full" />
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
