import type { EChartsOption } from 'echarts'
import { seriesMarks } from '@/charts/annotations'
import {
  axisTooltip,
  base,
  categoryAxis,
  fade,
  FOCUS,
  labelOf,
  numberOf,
  tooltipHeader,
  tooltipRow,
  truncate,
  valueAxis,
  xName,
  yName,
  type OptionContext,
  type Param,
} from '@/charts/options/common'
import type { Prepared } from '@/charts/prepared'
import type { ChartSpec } from '@/charts/spec'
import { SYMBOLS } from '@/charts/theme'
import { formatDateTick, formatTimePoint, formatValue, parseIsoUtc } from '@/lib/format'

// Lines and areas over time, and the calendar heatmap. Pure.

const DAY_MS = 86_400_000
/** With this many lines or fewer, each is named at its end instead of in a legend. */
const MAX_END_LABELS = 4

export function timeOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'time' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const multi = prepared.series.length > 1
  const endLabels =
    multi && prepared.series.length <= MAX_END_LABELS && !(spec.type === 'area' && spec.stacked)
  const values = prepared.series.flatMap((s) =>
    s.points.map(([, y]) => y).filter((y): y is number => y !== null),
  )
  const points = prepared.series[0]?.points.length ?? 0
  const step = points > 1 ? prepared.spanMs / (points - 1) : DAY_MS
  const xAxis =
    prepared.axis === 'time'
      ? {
          type: 'time' as const,
          name: xName(spec) ?? undefined,
          nameLocation: 'middle' as const,
          nameGap: 28,
          nameTextStyle: { color: theme.muted },
          axisLine: { lineStyle: { color: theme.axis } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: {
            color: theme.muted,
            hideOverlap: true,
            formatter: (value: number) => formatDateTick(value, locale, prepared.spanMs),
          },
        }
      : { ...categoryAxis(ctx, prepared.categories, xName(spec), false), boundaryGap: false }
  const shell = base(ctx, multi && !endLabels, false)
  return {
    ...shell,
    grid: endLabels ? { ...shell.grid, right: 104 } : shell.grid,
    tooltip: {
      ...shell.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: theme.axis } },
      formatter: axisTooltip(
        (value) => formatValue(value, spec.format, locale),
        prepared.axis === 'time'
          ? (params) => formatTimePoint(Number(params[0]?.axisValue ?? 0), locale, step)
          : undefined,
      ),
    },
    xAxis,
    yAxis: valueAxis(spec, ctx, yName(spec), values),
    series: prepared.series.map((s, i) => {
      const color = s.other
        ? theme.other
        : (theme.palette[i % theme.palette.length] ?? theme.palette[0] ?? theme.text)
      const data =
        prepared.axis === 'time'
          ? s.points
          : (() => {
              const byX = new Map(s.points.map(([x, y]) => [String(x), y]))
              return prepared.categories.map((x) => byX.get(x) ?? null)
            })()
      const area =
        spec.type === 'area'
          ? spec.stacked
            ? { opacity: 0.55 }
            : { color: fade(color) }
          : // A single line gets a faint fill, so the shape reads at a glance.
            multi
            ? undefined
            : { color: fade(color, 0.12) }
      return {
        type: 'line' as const,
        name: s.name,
        data,
        showSymbol: s.points.length <= 24,
        symbol: SYMBOLS[i % SYMBOLS.length],
        symbolSize: 6,
        sampling: 'lttb' as const,
        connectNulls: false,
        stack: spec.stacked ? 'total' : undefined,
        ...FOCUS,
        lineStyle: { width: 2.25, type: s.other ? ('dashed' as const) : ('solid' as const) },
        itemStyle: s.other ? { color: theme.other } : undefined,
        areaStyle: area,
        endLabel: endLabels
          ? {
              show: true,
              color,
              fontWeight: 500,
              distance: 8,
              formatter: (param: Param) => truncate(String(param.seriesName ?? ''), 14),
            }
          : undefined,
        label: labelOf(spec, ctx, 'top'),
        ...seriesMarks(spec, ctx, { horizontal: false, first: i === 0 }),
      }
    }),
  }
}

/** Cell height: roomy for one year, tighter when two calendars share the chart. */
const CELL_ONE_YEAR = 20
const CELL_TWO_YEARS = 13
const CALENDAR_TOP = 28
/** Month labels and spacing between stacked calendars. */
const CALENDAR_GAP = 36

export function calendarOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'calendar' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const compact = (value: unknown) =>
    formatValue(numberOf(value), spec.format, locale, { compact: true })
  const several = prepared.ranges.length > 1
  const cell = several ? CELL_TWO_YEARS : CELL_ONE_YEAR
  const block = 7 * cell + CALENDAR_GAP
  const inRange = ([from, to]: [string, string]) =>
    prepared.days.filter(([day]) => day >= from && day <= to)
  const shell = base(ctx, false, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) ?? {}
        const [day, value] = Array.isArray(param.value) ? (param.value as unknown[]) : []
        const date = parseIsoUtc(String(day ?? ''))
        return (
          tooltipHeader(
            date ? formatTimePoint(date.getTime(), locale, DAY_MS) : String(day ?? ''),
          ) +
          tooltipRow(
            param.marker,
            yName(spec) ?? 'Value',
            formatValue(numberOf(value), spec.format, locale),
          )
        )
      },
    },
    calendar: prepared.ranges.map((range, i) => ({
      range,
      top: CALENDAR_TOP + i * block,
      left: several ? 56 : 32,
      right: 16,
      cellSize: ['auto', cell],
      orient: 'horizontal',
      splitLine: { show: false },
      itemStyle: {
        color: theme.mode === 'dark' ? '#1f1f1f' : '#f4f4f5',
        borderColor: theme.background,
        borderWidth: 2,
      },
      yearLabel: { show: several, color: theme.muted, fontSize: 11, margin: 36 },
      dayLabel: { firstDay: 1, color: theme.muted, fontSize: 10 },
      monthLabel: { color: theme.muted, fontSize: 10 },
    })),
    visualMap: {
      min: prepared.min,
      max: prepared.max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      // Just under the last calendar.
      top: CALENDAR_TOP + prepared.ranges.length * block - CALENDAR_GAP + 20,
      itemHeight: 120,
      itemWidth: 10,
      inRange: { color: theme.sequential },
      textStyle: { color: theme.muted },
      formatter: (value: unknown) => compact(value),
    },
    series: prepared.ranges.map((range, i) => ({
      type: 'heatmap' as const,
      name: yName(spec) ?? '',
      coordinateSystem: 'calendar' as const,
      calendarIndex: i,
      data: inRange(range),
    })),
  }
}
