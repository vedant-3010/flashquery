import type { EChartsOption } from 'echarts'
import {
  base,
  barRadius,
  categoryAxis,
  escapeHtml,
  FOCUS,
  labelOf,
  numberOf,
  PLAIN,
  tooltipHeader,
  tooltipRow,
  valueAxis,
  xName,
  yName,
  type OptionContext,
  type Param,
} from '@/charts/options/common'
import type { Prepared } from '@/charts/prepared'
import type { ChartSpec } from '@/charts/spec'
import { withAlpha } from '@/charts/theme'
import { formatNumber, formatValue, humanizeName } from '@/lib/format'

// Distributions and relationships: scatter, histogram, box plot and heatmap. Pure.

function sizeScale(range: [number, number] | null) {
  if (!range) return 7
  const [min, max] = range
  return (value: number[]) => {
    const v = value[2]
    if (typeof v !== 'number' || max === min) return 10
    return 6 + 24 * Math.sqrt((v - min) / (max - min))
  }
}

export function scatterOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'scatter' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const multi = prepared.series.length > 1
  const xs = prepared.series.flatMap((s) => s.points.map(([x]) => x))
  const ys = prepared.series.flatMap((s) => s.points.map(([, y]) => y))
  const size = spec.size ? humanizeName(spec.size) : null
  const shell = base(ctx, multi, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) ?? {}
        const [x, y, z] = Array.isArray(param.value) ? (param.value as unknown[]) : []
        return (
          (multi ? tooltipHeader(String(param.seriesName ?? '')) : '') +
          tooltipRow(param.marker, xName(spec) ?? 'x', formatValue(numberOf(x), PLAIN, locale)) +
          tooltipRow('', yName(spec) ?? 'y', formatValue(numberOf(y), spec.format, locale)) +
          (size ? tooltipRow('', size, formatValue(numberOf(z), PLAIN, locale)) : '')
        )
      },
    },
    xAxis: {
      ...valueAxis({ ...spec, format: PLAIN, logScale: false }, ctx, xName(spec), xs, true, PLAIN),
      splitLine: { show: false },
      axisLine: { show: true, lineStyle: { color: theme.axis } },
      scale: true,
    },
    yAxis: { ...valueAxis(spec, ctx, yName(spec), ys), scale: true },
    series: prepared.series.map((s) => ({
      type: 'scatter' as const,
      name: s.name,
      data: s.points,
      symbolSize: sizeScale(prepared.sizeRange),
      large: s.points.length > 2_000,
      largeThreshold: 2_000,
      // Points on the axis edges are drawn whole rather than cut in half.
      clip: false,
      itemStyle: { opacity: 0.72, borderColor: theme.background, borderWidth: 0.5 },
      ...FOCUS,
    })),
  }
}

export function binsOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'bins' }>,
  ctx: OptionContext,
): EChartsOption {
  const { locale } = ctx
  const edge = (value: number) => formatValue(value, spec.format, locale, { compact: true })
  const counts = prepared.bins.map((bin) => bin.count)
  const shell = base(ctx, false, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: unknown) => formatNumber(numberOf(value), locale),
    },
    xAxis: categoryAxis(
      ctx,
      prepared.bins.map((bin) => `${edge(bin.start)}–${edge(bin.end)}`),
      yName(spec),
      false,
    ),
    yAxis: valueAxis({ ...spec, format: PLAIN }, ctx, 'Rows', counts, false, PLAIN),
    series: [
      {
        type: 'bar',
        name: 'Rows',
        data: counts,
        barCategoryGap: '6%',
        itemStyle: { borderRadius: barRadius(false) },
        label: labelOf({ ...spec, format: PLAIN }, ctx, 'top', PLAIN),
      },
    ],
  }
}

const BOX_ROWS = [
  'Upper whisker',
  'Upper quartile',
  'Median',
  'Lower quartile',
  'Lower whisker',
] as const

export function boxplotOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'boxplot' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const color = theme.palette[0] ?? theme.text
  const values = prepared.groups.flatMap((group) => group.stats)
  const fmt = (value: number) => formatValue(value, spec.format, locale)
  const shell = base(ctx, false, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) ?? {}
        const group = prepared.groups[param.dataIndex ?? 0]
        if (!group) return ''
        const [low, q1, median, q3, high] = group.stats
        const rows = [high, q3, median, q1, low].map((value, i) =>
          tooltipRow(i === 2 ? param.marker : '', BOX_ROWS[i] ?? '', fmt(value)),
        )
        const count =
          group.count === null ? '' : tooltipRow('', 'Rows', formatNumber(group.count, locale))
        const beyond = group.outliers
          ? tooltipRow('', 'Beyond the whiskers', formatNumber(group.outliers, locale))
          : ''
        return tooltipHeader(group.name) + rows.join('') + count + beyond
      },
    },
    xAxis: categoryAxis(
      ctx,
      prepared.groups.map((group) => group.name),
      xName(spec),
      false,
    ),
    yAxis: valueAxis(spec, ctx, yName(spec), values),
    series: [
      {
        type: 'boxplot',
        name: yName(spec) ?? '',
        data: prepared.groups.map((group) => group.stats),
        boxWidth: [10, 44],
        itemStyle: { color: withAlpha(color, 0.18), borderColor: color, borderWidth: 1.5 },
        emphasis: { itemStyle: { color: withAlpha(color, 0.32), borderWidth: 2 } },
      },
    ],
  }
}

export function heatmapOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'heatmap' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const compact = (value: unknown) =>
    formatValue(numberOf(value), spec.format, locale, { compact: true })
  const shell = base(ctx, false, false)
  return {
    ...shell,
    grid: {
      left: 12,
      right: 24,
      top: 32,
      bottom: 56,
      outerBoundsMode: 'same',
      outerBoundsContain: 'all',
    },
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) ?? {}
        const [xi, yi, v] = Array.isArray(param.value) ? (param.value as unknown[]) : []
        const x = prepared.xs[Number(xi)] ?? ''
        const y = prepared.ys[Number(yi)] ?? ''
        return `${escapeHtml(x)} × ${escapeHtml(y)}<br/><b>${formatValue(numberOf(v), spec.format, locale)}</b>`
      },
    },
    xAxis: { ...categoryAxis(ctx, prepared.xs, xName(spec), false), splitArea: { show: true } },
    yAxis: {
      ...categoryAxis(ctx, prepared.ys, spec.series ? humanizeName(spec.series) : null, false),
      nameLocation: 'end',
      nameGap: 8,
      splitArea: { show: true },
    },
    visualMap: {
      min: prepared.min,
      max: prepared.max,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 120,
      itemWidth: 10,
      inRange: { color: theme.sequential },
      textStyle: { color: theme.muted },
      formatter: (value: unknown) => compact(value),
    },
    series: [
      {
        type: 'heatmap',
        name: yName(spec) ?? '',
        data: prepared.cells,
        itemStyle: { borderColor: theme.background, borderWidth: 2, borderRadius: 3 },
        label: spec.labels
          ? {
              show: true,
              color: '#ffffff',
              formatter: (param: Param) =>
                compact(Array.isArray(param.value) ? param.value[2] : null),
            }
          : { show: false },
        emphasis: { itemStyle: { borderColor: theme.text, borderWidth: 1 } },
      },
    ],
  }
}
