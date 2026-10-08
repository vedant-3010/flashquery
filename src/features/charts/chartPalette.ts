import { createContext, useContext } from 'react'
import type { ChartPalette, ChartSpec } from '@/charts/spec'
import { useSettingsStore } from '@/stores/settings'

/** A dashboard's colors for the charts inside it (F-VIZ-12); null: the default in Settings. */
export const DashboardPaletteContext = createContext<ChartPalette | null>(null)

/** The palette a chart is drawn with: its own, else its dashboard's, else the default. */
export function useChartPalette(spec: ChartSpec): ChartPalette {
  const dashboard = useContext(DashboardPaletteContext)
  const fallback = useSettingsStore((state) => state.chartPalette)
  return spec.palette ?? dashboard ?? fallback
}
