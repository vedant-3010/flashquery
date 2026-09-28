import type { Prepared } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { formatValue } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

type KpiData = Extract<Prepared, { kind: 'kpi' }>

/** One big number per measure (F-VIZ-02 KPI and KPI group). */
export function KpiView({ spec, prepared }: { spec: ChartSpec; prepared: KpiData }) {
  const locale = useSettingsStore((state) => state.locale)
  return (
    <div className="grid gap-2">
      {prepared.caption && <p className="text-xs text-muted-foreground">{prepared.caption}</p>}
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
        {prepared.items.map((item) => {
          const compact = formatValue(item.value, spec.format, locale, { compact: true })
          const full = formatValue(item.value, spec.format, locale)
          return (
            <li key={item.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums" title={full}>
                {compact}
              </p>
              {compact !== full && (
                <p className="text-xs text-muted-foreground tabular-nums">{full}</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
