import {
  AreaChart,
  BarChart3,
  BarChartHorizontal,
  ChartColumnStacked,
  ChartNoAxesColumn,
  ChartScatter,
  Grid3x3,
  Hash,
  LineChart,
  PieChart,
  Sheet,
  type LucideIcon,
} from 'lucide-react'
import type { ChartType } from '@/charts/spec'

const ICONS: Record<ChartType, LucideIcon> = {
  kpi: Hash,
  line: LineChart,
  area: AreaChart,
  bar: BarChart3,
  hbar: BarChartHorizontal,
  grouped_bar: ChartNoAxesColumn,
  stacked_bar: ChartColumnStacked,
  scatter: ChartScatter,
  histogram: BarChart3,
  donut: PieChart,
  heatmap: Grid3x3,
  table: Sheet,
}

export function ChartTypeIcon({ type }: { type: ChartType }) {
  const Icon = ICONS[type]
  return <Icon aria-hidden />
}
