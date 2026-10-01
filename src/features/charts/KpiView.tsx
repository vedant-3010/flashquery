import type { Prepared } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { formatValue } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

type KpiData = Extract<Prepared, { kind: 'kpi' }>

/** One big number per measure (F-VIZ-02 KPI and KPI group). */
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
  return (
    <div className="grid gap-2">
      {prepared.caption && <p className="text-xs text-muted-foreground">{prepared.caption}</p>}
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
              {short !== full && (
                <p className="text-xs text-muted-foreground tabular-nums">{full}</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
