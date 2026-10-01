import type { RefObject } from 'react'
import type { ChartData } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { EChart } from '@/features/charts/EChart'
import type { ECharts } from '@/features/charts/echarts'
import { KpiView } from '@/features/charts/KpiView'
import { useChartOption } from '@/features/charts/useChartOption'

/** Just the chart (or KPIs) for a spec and its data: answer cards and dashboard tiles. */
export function ChartView({
  spec,
  data,
  className,
  compact = false,
  instanceRef,
}: {
  spec: ChartSpec
  data: ChartData
  className?: string
  /** Tiles: KPIs without their own border. */
  compact?: boolean
  instanceRef?: RefObject<ECharts | null>
}) {
  const { prepared, option, label } = useChartOption(spec, data)
  if (prepared.kind === 'kpi') return <KpiView spec={spec} prepared={prepared} compact={compact} />
  if (!option) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        This result is shown as a table.
      </p>
    )
  }
  return <EChart option={option} label={label} instanceRef={instanceRef} className={className} />
}
