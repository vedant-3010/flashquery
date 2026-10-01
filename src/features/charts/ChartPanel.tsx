import { Info, RotateCcw, Table2 } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { analyze } from '@/charts/classify'
import { chartChoices } from '@/charts/select'
import type { ChartData } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { Button } from '@/components/ui/button'
import type { CellValue, ColumnMeta } from '@/engine/types'
import { ChartExportMenu } from '@/features/charts/ChartExportMenu'
import { ChartSettings } from '@/features/charts/ChartSettings'
import { ChartTypeMenu } from '@/features/charts/ChartTypeMenu'
import { ChartView } from '@/features/charts/ChartView'
import type { ECharts } from '@/features/charts/echarts'
import { useChartOption } from '@/features/charts/useChartOption'
import { useSettingsStore } from '@/stores/settings'

export interface ChartPanelProps {
  spec: ChartSpec
  data: ChartData
  /** The result's columns and first rows: what the switcher and settings re-fit charts to. */
  columns: ColumnMeta[]
  rows: CellValue[][]
  rowCount: number
  question?: string
  /** The automatic choice, and whether the user changed it (shows "Reset"). */
  auto: ChartSpec
  picked: boolean
  onChange: (spec: ChartSpec) => void
  onViewTable?: () => void
  /** Chart data is being read for a new spec. */
  loading?: boolean
}

/**
 * A result's chart (F-VIZ-01…07): switcher, settings, export, the chart (or KPIs), what was
 * sampled, and why this chart (F-EXPL-03). Lazy-loaded with ECharts.
 */
export function ChartPanel(props: ChartPanelProps) {
  const { spec, data, columns, rows, rowCount, question, onChange } = props
  const currency = useSettingsStore((state) => state.currency)
  const chartRef = useRef<ECharts | null>(null)
  const shape = useMemo(() => analyze(columns, rows, rowCount), [columns, rows, rowCount])
  const choices = useMemo(
    () => chartChoices(shape, spec, { question, currency }),
    [shape, spec, question, currency],
  )
  const { option, theme, notes } = useChartOption(spec, data)

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ChartTypeMenu current={spec.type} choices={choices} onPick={onChange} />
        {spec.type !== 'table' && (
          <ChartSettings
            spec={spec}
            shape={shape}
            question={question}
            currency={currency}
            onChange={onChange}
          />
        )}
        {option && (
          <ChartExportMenu chartRef={chartRef} option={option} theme={theme} title={spec.title} />
        )}
        {props.picked && (
          <Button size="xs" variant="ghost" onClick={() => onChange(props.auto)}>
            <RotateCcw aria-hidden />
            Reset
          </Button>
        )}
        {props.onViewTable && (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={props.onViewTable}>
            <Table2 aria-hidden />
            View as table
          </Button>
        )}
      </div>

      <div className={props.loading ? 'opacity-50 transition-opacity' : undefined}>
        <ChartView spec={spec} data={data} instanceRef={chartRef} className="h-72 w-full" />
      </div>

      {notes.map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">Why this chart: </span>
          {props.picked ? 'You picked this chart. ' : ''}
          {spec.reason}
        </span>
      </p>
    </div>
  )
}
