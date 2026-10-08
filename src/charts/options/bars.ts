import type { EChartsOption } from 'echarts'
import { seriesMarks } from '@/charts/annotations'
import {
  axisTooltip,
  barRadius,
  base,
  categoryAxis,
  categoryLabels,
  FOCUS,
  labelOf,
  numberOf,
  PERCENT,
  PLAIN,
  tooltipHeader,
  tooltipRow,
  valueAxis,
  xName,
  yName,
  type OptionContext,
  type Param,
} from '@/charts/options/common'
import type { NamedValues, Prepared } from '@/charts/prepared'
import type { ChartSpec } from '@/charts/spec'
import { withAlpha } from '@/charts/theme'
import { formatValue } from '@/lib/format'

// Bars (bar, horizontal, grouped, stacked, 100% stacked), bar and line, and waterfall. Pure.

const present = (values: (number | null)[]) => values.filter((v): v is number => v !== null)

export function categoryOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'category' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const horizontal = spec.type === 'hbar'
  const share = spec.type === 'stacked_100'
  const stacked = spec.stacked || share
  const multi = prepared.series.length > 1
  // 100% stacked: each bar is its own whole.
  const totals = prepared.categories.map((_, i) =>
    prepared.series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0),
  )
  const shown = (s: NamedValues) =>
    share
      ? s.values.map((v, i) => (v === null || !totals[i] ? null : v / (totals[i] ?? 1)))
      : s.values
  const values = prepared.series.flatMap((s) => present(shown(s)))
  const format = share ? PERCENT : spec.format
  const labels = categoryLabels(prepared.categories, prepared.times, ctx)
  const cats = categoryAxis(ctx, labels, horizontal ? null : xName(spec), horizontal)
  const axisName = share ? 'Share' : yName(spec)
  const vals = {
    ...valueAxis(spec, ctx, axisName, values, horizontal, format),
    ...(share ? { min: 0, max: 1 } : {}),
  }
  const shell = base(ctx, multi, multi)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: withAlpha(theme.text, 0.05) } },
      formatter: axisTooltip((value, param: Param) => {
        if (!share) return formatValue(value, spec.format, locale)
        const raw = prepared.series.find((s) => s.name === param.seriesName)?.values[
          param.dataIndex ?? 0
        ]
        return `${formatValue(value, PERCENT, locale)} · ${formatValue(raw ?? null, spec.format, locale, { compact: true })}`
      }),
    },
    xAxis: horizontal ? vals : cats,
    yAxis: horizontal ? cats : vals,
    series: prepared.series.map((s, i) => ({
      type: 'bar' as const,
      name: s.name,
      data: shown(s),
      stack: stacked ? 'total' : undefined,
      barMaxWidth: 44,
      barCategoryGap: multi ? '28%' : '36%',
      ...FOCUS,
      itemStyle: {
        ...(s.other ? { color: theme.other } : {}),
        // Stacked segments sit flush, split by a hairline; single bars get rounded ends.
        ...(stacked
          ? { borderColor: theme.background, borderWidth: 1 }
          : { borderRadius: barRadius(horizontal) }),
      },
      label: labelOf(spec, ctx, stacked ? 'inside' : horizontal ? 'right' : 'top', format),
      ...seriesMarks(spec, ctx, { horizontal, first: i === 0 }),
    })),
  }
}

export function comboOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'combo' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const lineFormat = spec.format2 ?? PLAIN
  const lineColor = theme.palette[1] ?? theme.palette[0] ?? theme.text
  const labels = categoryLabels(prepared.categories, prepared.times, ctx)
  const shell = base(ctx, true, false)
  const lineAxis = valueAxis(
    { ...spec, logScale: false, annotations: undefined },
    ctx,
    prepared.line.name,
    present(prepared.line.values),
    false,
    lineFormat,
  )
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: withAlpha(theme.text, 0.05) } },
      formatter: axisTooltip((value, param) =>
        formatValue(
          value,
          param.seriesName === prepared.line.name ? lineFormat : spec.format,
          locale,
        ),
      ),
    },
    xAxis: categoryAxis(ctx, labels, xName(spec), false),
    yAxis: [
      valueAxis(spec, ctx, prepared.bars.name, present(prepared.bars.values)),
      {
        ...lineAxis,
        splitLine: { show: false },
        nameTextStyle: { color: theme.muted, align: 'right' as const },
      },
    ],
    series: [
      {
        type: 'bar',
        name: prepared.bars.name,
        data: prepared.bars.values,
        barMaxWidth: 40,
        itemStyle: { borderRadius: barRadius(false) },
        ...FOCUS,
        label: labelOf(spec, ctx, 'top'),
        ...seriesMarks(spec, ctx, { horizontal: false, first: true }),
      },
      {
        type: 'line',
        name: prepared.line.name,
        yAxisIndex: 1,
        data: prepared.line.values,
        z: 3,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: prepared.categories.length <= 24,
        connectNulls: false,
        lineStyle: { width: 2.5, color: lineColor },
        itemStyle: { color: lineColor, borderColor: theme.background, borderWidth: 2 },
        ...FOCUS,
        label: labelOf(spec, ctx, 'top', lineFormat),
      },
    ],
  }
}

export function waterfallOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'waterfall' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const fmt = (value: number | null) => formatValue(value, spec.format, locale, { compact: true })
  const signed = (value: number) => (value > 0 ? `+${fmt(value)}` : fmt(value))
  const names = [...prepared.steps.map((step) => step.name), 'Total']
  const labels = [
    ...categoryLabels(
      prepared.steps.map((step) => step.name),
      prepared.times,
      ctx,
    ),
    'Total',
  ]
  // Each step floats from where the last one ended; the total stands on zero.
  const lows: number[] = []
  const bars: { value: number; raw: number; running: number; itemStyle: object }[] = []
  let running = 0
  for (const step of prepared.steps) {
    const start = running
    running += step.value
    lows.push(Math.min(start, running))
    bars.push({
      value: Math.abs(step.value),
      raw: step.value,
      running,
      itemStyle: { color: step.value >= 0 ? theme.increase : theme.decrease, borderRadius: 3 },
    })
  }
  lows.push(Math.min(0, running))
  bars.push({
    value: Math.abs(running),
    raw: running,
    running,
    itemStyle: { color: theme.palette[0] ?? theme.text, borderRadius: 3 },
  })
  const last = bars.length - 1
  const extent = [0, ...lows, ...bars.map((bar) => bar.running)]
  const shell = base(ctx, false, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) ?? {}
        const i = param.dataIndex ?? 0
        const bar = bars[i]
        if (!bar) return ''
        return (
          tooltipHeader(names[i] ?? '') +
          (i === last
            ? tooltipRow(param.marker, 'Total', fmt(bar.raw))
            : tooltipRow(param.marker, 'Change', signed(bar.raw)) +
              tooltipRow('', 'Running total', fmt(bar.running)))
        )
      },
    },
    xAxis: categoryAxis(ctx, labels, xName(spec), false),
    yAxis: valueAxis(spec, ctx, yName(spec), extent),
    series: [
      {
        type: 'bar',
        name: 'base',
        stack: 'steps',
        stackStrategy: 'all',
        data: lows,
        silent: true,
        itemStyle: { color: 'transparent' },
        emphasis: { disabled: true },
        tooltip: { show: false },
      },
      {
        type: 'bar',
        name: yName(spec) ?? 'Change',
        stack: 'steps',
        stackStrategy: 'all',
        data: bars,
        barMaxWidth: 44,
        label: spec.labels
          ? {
              show: true,
              position: 'top',
              color: theme.text,
              fontSize: 11,
              formatter: (param: Param) => {
                const raw = numberOf((param.data as { raw?: unknown } | undefined)?.raw)
                return raw === null ? '' : param.dataIndex === last ? fmt(raw) : signed(raw)
              },
            }
          : { show: false },
      },
    ],
  }
}
