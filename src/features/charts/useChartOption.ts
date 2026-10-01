import { useMemo } from 'react'
import { isAdditiveName } from '@/charts/classify'
import { prepare, type ChartData } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { chartTheme } from '@/charts/theme'
import { describeChart, toOption } from '@/charts/toOption'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { useSettingsStore } from '@/stores/settings'

/** Shaped data, the ECharts option and its text alternative, for the current theme and locale. */
export function useChartOption(spec: ChartSpec, data: ChartData) {
  const locale = useSettingsStore((state) => state.locale)
  const theme = chartTheme(useResolvedTheme())
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const prepared = useMemo(() => prepare(spec, data, spec.y.every(isAdditiveName)), [spec, data])
  const option = useMemo(
    () => toOption(spec, prepared, { theme, locale, animation: !reducedMotion }),
    [spec, prepared, theme, locale, reducedMotion],
  )
  return {
    prepared,
    option,
    theme,
    label: describeChart(spec, prepared, locale),
    notes: 'notes' in prepared ? prepared.notes : [],
  }
}
