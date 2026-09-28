import type { EChartsOption } from 'echarts'
import { OTHER, type Prepared } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { FONT_FAMILY, SYMBOLS, type ChartTheme } from '@/charts/theme'
import { CHART_TYPE_LABELS } from '@/charts/spec'
import { formatDateTick, formatNumber, formatValue, humanizeName } from '@/lib/format'

// (spec, prepared data, theme, locale) → ECharts option (ui rules). Pure; snapshot-tested.
// Category names and values come from the user's data: they're drawn on canvas, and the only HTML
// tooltips (scatter, heatmap) escape them.

export interface OptionContext {
  theme: ChartTheme
  locale: string
  /** False when the user prefers reduced motion. */
  animation: boolean
}

type Param = { value?: unknown; name?: unknown; seriesName?: unknown; marker?: unknown }

const MAX_LABEL = 22
const PERCENT = { y: 'percent' as const, currency: null }
const truncate = (text: string, max = MAX_LABEL) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  )
}

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function base(ctx: OptionContext, legend: boolean, decals: boolean): EChartsOption {
  const { theme } = ctx
  return {
    animation: ctx.animation,
    useUTC: true,
    color: theme.palette,
    backgroundColor: 'transparent',
    textStyle: { color: theme.text, fontFamily: FONT_FAMILY, fontSize: 12 },
    // Decal patterns tell series apart without color; ECharts' own aria text is replaced by ours.
    aria: { enabled: decals, label: { enabled: false }, decal: { show: decals } },
    tooltip: {
      confine: true,
      backgroundColor: theme.tooltipBackground,
      borderColor: theme.tooltipBorder,
      textStyle: { color: theme.text, fontSize: 12, fontFamily: FONT_FAMILY },
    },
    legend: legend
      ? {
          type: 'scroll',
          bottom: 0,
          icon: 'roundRect',
          textStyle: { color: theme.muted },
          pageTextStyle: { color: theme.muted },
          formatter: (name: string) => truncate(name),
        }
      : { show: false },
    // Axis labels and names stay inside the chart (ECharts 6 outer bounds; replaces containLabel).
    grid: {
      left: 12,
      right: 24,
      top: 32,
      bottom: legend ? 44 : 12,
      outerBoundsMode: 'same',
      outerBoundsContain: 'all',
    },
  }
}

function valueAxis(
  spec: ChartSpec,
  ctx: OptionContext,
  name: string | null,
  values: number[],
  horizontal = false,
) {
  const log = spec.logScale && values.length > 0 && values.every((value) => value > 0)
  return {
    type: log ? ('log' as const) : ('value' as const),
    name: name ?? undefined,
    // Vertical axes carry their title on top; horizontal ones below, centered.
    ...(horizontal
      ? { nameLocation: 'middle' as const, nameGap: 28, nameTextStyle: { color: ctx.theme.muted } }
      : { nameTextStyle: { color: ctx.theme.muted, align: 'left' as const } }),
    axisLabel: {
      color: ctx.theme.muted,
      formatter: (value: number) => formatValue(value, spec.format, ctx.locale, { compact: true }),
    },
    splitLine: { lineStyle: { color: ctx.theme.grid } },
  }
}

function categoryAxis(
  ctx: OptionContext,
  data: string[],
  name: string | null,
  horizontal: boolean,
) {
  return {
    type: 'category' as const,
    data,
    name: name ?? undefined,
    nameLocation: 'middle' as const,
    nameGap: horizontal ? 0 : 28,
    nameTextStyle: { color: ctx.theme.muted },
    inverse: horizontal,
    axisTick: { show: false },
    axisLine: { lineStyle: { color: ctx.theme.axis } },
    axisLabel: {
      color: ctx.theme.muted,
      hideOverlap: !horizontal,
      interval: horizontal ? 0 : ('auto' as const),
      formatter: (value: string) => truncate(value, horizontal ? 28 : 16),
    },
  }
}

function labelOf(spec: ChartSpec, ctx: OptionContext, position: 'top' | 'right' | 'inside') {
  return spec.labels
    ? {
        show: true,
        position,
        color: position === 'inside' ? '#ffffff' : ctx.theme.text,
        formatter: (params: Param | Param[]) => {
          const param = (Array.isArray(params) ? params[0] : params) ?? {}
          const value = Array.isArray(param.value) ? param.value.at(-1) : param.value
          return formatValue(numberOf(value), spec.format, ctx.locale, { compact: true })
        },
      }
    : { show: false }
}

const yName = (spec: ChartSpec) =>
  spec.y.length === 1 && spec.y[0] ? humanizeName(spec.y[0]) : null
const xName = (spec: ChartSpec) => (spec.x ? humanizeName(spec.x) : null)
const valueFormatter = (spec: ChartSpec, ctx: OptionContext) => (value: unknown) =>
  formatValue(numberOf(value), spec.format, ctx.locale)

function categoryOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'category' }>,
  ctx: OptionContext,
): EChartsOption {
  const horizontal = spec.type === 'hbar'
  const multi = prepared.series.length > 1
  const values = prepared.series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const cats = categoryAxis(ctx, prepared.categories, horizontal ? null : xName(spec), horizontal)
  const vals = valueAxis(spec, ctx, yName(spec), values, horizontal)
  return {
    ...base(ctx, multi, multi),
    tooltip: {
      ...base(ctx, multi, multi).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: valueFormatter(spec, ctx),
    },
    xAxis: horizontal ? vals : cats,
    yAxis: horizontal ? cats : vals,
    series: prepared.series.map((s) => ({
      type: 'bar' as const,
      name: s.name,
      data: s.values,
      stack: spec.stacked ? 'total' : undefined,
      barMaxWidth: 48,
      emphasis: { focus: 'series' as const },
      itemStyle: s.other ? { color: ctx.theme.other } : undefined,
      label: labelOf(spec, ctx, spec.stacked ? 'inside' : horizontal ? 'right' : 'top'),
    })),
  }
}

function timeOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'time' }>,
  ctx: OptionContext,
): EChartsOption {
  const multi = prepared.series.length > 1
  const values = prepared.series.flatMap((s) =>
    s.points.map(([, y]) => y).filter((y): y is number => y !== null),
  )
  const xAxis =
    prepared.axis === 'time'
      ? {
          type: 'time' as const,
          name: xName(spec) ?? undefined,
          nameLocation: 'middle' as const,
          nameGap: 28,
          nameTextStyle: { color: ctx.theme.muted },
          axisLine: { lineStyle: { color: ctx.theme.axis } },
          splitLine: { show: false },
          axisLabel: {
            color: ctx.theme.muted,
            hideOverlap: true,
            formatter: (value: number) => formatDateTick(value, ctx.locale, prepared.spanMs),
          },
        }
      : { ...categoryAxis(ctx, prepared.categories, xName(spec), false), boundaryGap: false }
  return {
    ...base(ctx, multi, false),
    tooltip: {
      ...base(ctx, multi, false).tooltip,
      trigger: 'axis',
      valueFormatter: valueFormatter(spec, ctx),
    },
    xAxis,
    yAxis: valueAxis(spec, ctx, yName(spec), values),
    series: prepared.series.map((s, i) => {
      const data =
        prepared.axis === 'time'
          ? s.points
          : (() => {
              const byX = new Map(s.points.map(([x, y]) => [String(x), y]))
              return prepared.categories.map((x) => byX.get(x) ?? null)
            })()
      return {
        type: 'line' as const,
        name: s.name,
        data,
        showSymbol: s.points.length <= 60,
        symbol: SYMBOLS[i % SYMBOLS.length],
        symbolSize: 6,
        sampling: 'lttb' as const,
        connectNulls: false,
        stack: spec.stacked ? 'total' : undefined,
        emphasis: { focus: 'series' as const },
        lineStyle: { width: 2, type: s.other ? ('dashed' as const) : ('solid' as const) },
        itemStyle: s.other ? { color: ctx.theme.other } : undefined,
        areaStyle: spec.type === 'area' ? { opacity: spec.stacked ? 0.7 : 0.25 } : undefined,
        label: labelOf(spec, ctx, 'top'),
      }
    }),
  }
}

function pieOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'pie' }>,
  ctx: OptionContext,
): EChartsOption {
  return {
    ...base(ctx, true, true),
    tooltip: {
      ...base(ctx, true, true).tooltip,
      trigger: 'item',
      valueFormatter: valueFormatter(spec, ctx),
    },
    series: [
      {
        type: 'pie',
        name: yName(spec) ?? '',
        radius: ['45%', '70%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: ctx.theme.background, borderWidth: 2 },
        label: {
          color: ctx.theme.text,
          formatter: (param: Param & { percent?: number }) =>
            `${truncate(String(param.name ?? ''), 18)}\n${formatValue((param.percent ?? 0) / 100, PERCENT, ctx.locale)}`,
        },
        labelLine: { lineStyle: { color: ctx.theme.axis } },
        data: prepared.slices.map((slice) => ({
          name: slice.name,
          value: slice.value,
          itemStyle: slice.name === OTHER ? { color: ctx.theme.other } : undefined,
        })),
      },
    ],
  }
}

function sizeScale(range: [number, number] | null) {
  if (!range) return 7
  const [min, max] = range
  return (value: number[]) => {
    const v = value[2]
    if (typeof v !== 'number' || max === min) return 10
    return 6 + 24 * Math.sqrt((v - min) / (max - min))
  }
}

function scatterOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'scatter' }>,
  ctx: OptionContext,
): EChartsOption {
  const multi = prepared.series.length > 1
  const xs = prepared.series.flatMap((s) => s.points.map(([x]) => x))
  const ys = prepared.series.flatMap((s) => s.points.map(([, y]) => y))
  const xStyle = { y: 'number' as const, currency: null }
  const size = spec.size ? humanizeName(spec.size) : null
  return {
    ...base(ctx, multi, false),
    tooltip: {
      ...base(ctx, multi, false).tooltip,
      trigger: 'item',
      formatter: (params: Param | Param[]) => {
        const param = (Array.isArray(params) ? params[0] : params) ?? {}
        const [x, y, z] = Array.isArray(param.value) ? (param.value as unknown[]) : []
        const lines = [
          multi ? `<b>${escapeHtml(String(param.seriesName ?? ''))}</b>` : null,
          `${escapeHtml(xName(spec) ?? 'x')}: ${formatValue(numberOf(x), xStyle, ctx.locale)}`,
          `${escapeHtml(yName(spec) ?? 'y')}: ${formatValue(numberOf(y), spec.format, ctx.locale)}`,
          size ? `${escapeHtml(size)}: ${formatValue(numberOf(z), xStyle, ctx.locale)}` : null,
        ]
        return lines.filter(Boolean).join('<br/>')
      },
    },
    xAxis: {
      ...valueAxis({ ...spec, format: xStyle, logScale: false }, ctx, xName(spec), xs, true),
      splitLine: { show: false },
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
      itemStyle: { opacity: 0.75 },
      emphasis: { focus: 'series' as const },
    })),
  }
}

function binsOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'bins' }>,
  ctx: OptionContext,
): EChartsOption {
  const edge = (value: number) => formatValue(value, spec.format, ctx.locale, { compact: true })
  const counts = prepared.bins.map((bin) => bin.count)
  const countStyle = { y: 'number' as const, currency: null }
  return {
    ...base(ctx, false, false),
    tooltip: {
      ...base(ctx, false, false).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: unknown) => formatNumber(numberOf(value), ctx.locale),
    },
    xAxis: categoryAxis(
      ctx,
      prepared.bins.map((bin) => `${edge(bin.start)}–${edge(bin.end)}`),
      yName(spec),
      false,
    ),
    yAxis: valueAxis({ ...spec, format: countStyle }, ctx, 'Rows', counts),
    series: [
      {
        type: 'bar',
        name: 'Rows',
        data: counts,
        barCategoryGap: '4%',
        label: labelOf({ ...spec, format: countStyle }, ctx, 'top'),
      },
    ],
  }
}

function heatmapOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'heatmap' }>,
  ctx: OptionContext,
): EChartsOption {
  const compact = (value: unknown) =>
    formatValue(numberOf(value), spec.format, ctx.locale, { compact: true })
  return {
    ...base(ctx, false, false),
    grid: {
      left: 12,
      right: 24,
      top: 32,
      bottom: 56,
      outerBoundsMode: 'same',
      outerBoundsContain: 'all',
    },
    tooltip: {
      ...base(ctx, false, false).tooltip,
      trigger: 'item',
      formatter: (params: Param | Param[]) => {
        const param = (Array.isArray(params) ? params[0] : params) ?? {}
        const [xi, yi, v] = Array.isArray(param.value) ? (param.value as unknown[]) : []
        const x = prepared.xs[Number(xi)] ?? ''
        const y = prepared.ys[Number(yi)] ?? ''
        return `${escapeHtml(x)} × ${escapeHtml(y)}<br/><b>${formatValue(numberOf(v), spec.format, ctx.locale)}</b>`
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
      inRange: { color: ctx.theme.sequential },
      textStyle: { color: ctx.theme.muted },
      formatter: (value: unknown) => compact(value),
    },
    series: [
      {
        type: 'heatmap',
        name: yName(spec) ?? '',
        data: prepared.cells,
        itemStyle: { borderColor: ctx.theme.background, borderWidth: 1 },
        label: spec.labels
          ? {
              show: true,
              color: '#ffffff',
              formatter: (param: Param) =>
                compact(Array.isArray(param.value) ? param.value[2] : null),
            }
          : { show: false },
        emphasis: { itemStyle: { borderColor: ctx.theme.text, borderWidth: 1 } },
      },
    ],
  }
}

/** The ECharts option for a chart, or null for KPIs and tables (drawn by React). */
export function toOption(
  spec: ChartSpec,
  prepared: Prepared,
  ctx: OptionContext,
): EChartsOption | null {
  switch (prepared.kind) {
    case 'category':
      return categoryOption(spec, prepared, ctx)
    case 'time':
      return timeOption(spec, prepared, ctx)
    case 'pie':
      return pieOption(spec, prepared, ctx)
    case 'scatter':
      return scatterOption(spec, prepared, ctx)
    case 'bins':
      return binsOption(spec, prepared, ctx)
    case 'heatmap':
      return heatmapOption(spec, prepared, ctx)
    case 'kpi':
    case 'table':
      return null
  }
}

/** A one-sentence text alternative for the chart (aria-label; ui rules). */
export function describeChart(spec: ChartSpec, prepared: Prepared, locale: string): string {
  const kind = `${CHART_TYPE_LABELS[spec.type]} chart`
  const fmt = (value: number | null) => formatValue(value, spec.format, locale)
  switch (prepared.kind) {
    case 'category': {
      const [first] = prepared.series
      if (!first) return `${kind}: ${spec.title}.`
      const pairs = prepared.categories
        .map((name, i) => ({ name, value: first.values[i] ?? null }))
        .filter((pair): pair is { name: string; value: number } => pair.value !== null)
        .sort((a, b) => b.value - a.value)
      const top = pairs[0]
      const bottom = pairs.at(-1)
      const extremes =
        top && bottom && top !== bottom
          ? ` Highest ${top.name} (${fmt(top.value)}), lowest ${bottom.name} (${fmt(bottom.value)}).`
          : ''
      return `${kind}: ${spec.title}. ${prepared.categories.length} categories${prepared.series.length > 1 ? `, ${prepared.series.length} series` : ''}.${extremes}`
    }
    case 'time': {
      const [first] = prepared.series
      const points = first?.points ?? []
      const start = points[0]?.[1] ?? null
      const end = points.at(-1)?.[1] ?? null
      return `${kind}: ${spec.title}. ${prepared.series.length} ${prepared.series.length === 1 ? 'line' : 'lines'} of ${points.length} points${first ? `; ${first.name} goes from ${fmt(start)} to ${fmt(end)}` : ''}.`
    }
    case 'pie':
      return `${kind}: ${spec.title}. ${prepared.slices
        .map((slice) => `${slice.name} ${fmt(slice.value)}`)
        .join(', ')}.`
    case 'scatter':
      return `${kind}: ${spec.title}. ${prepared.series.reduce((sum, s) => sum + s.points.length, 0)} points.`
    case 'bins':
      return `${kind}: ${spec.title}. ${prepared.bins.length} bins.`
    case 'heatmap':
      return `${kind}: ${spec.title}. ${prepared.xs.length} × ${prepared.ys.length} cells, from ${fmt(prepared.min)} to ${fmt(prepared.max)}.`
    case 'kpi':
      return prepared.items.map((item) => `${item.label}: ${fmt(item.value)}`).join('. ')
    case 'table':
      return spec.reason
  }
}
