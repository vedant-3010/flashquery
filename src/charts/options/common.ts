import type { EChartsOption } from 'echarts'
import type { ChartSpec, ValueFormat } from '@/charts/spec'
import { FONT_FAMILY, withAlpha, type ChartTheme } from '@/charts/theme'
import { formatDateTick, formatValue, humanizeName } from '@/lib/format'

// Shared pieces of every ECharts option (ui rules), and the chart style (F-VIZ-11): hairline dashed
// grids, no tick marks, round legend markers, a card tooltip, rounded bars, hover focus that dims
// the other series, and a short eased entrance (none with reduced motion). Pure.
// Category names and values come from the user's data: they're drawn on canvas, and every HTML
// tooltip escapes them.

export interface OptionContext {
  theme: ChartTheme
  locale: string
  /** False when the user prefers reduced motion. */
  animation: boolean
}

export type Param = {
  value?: unknown
  name?: unknown
  seriesName?: unknown
  marker?: unknown
  axisValue?: unknown
  axisValueLabel?: unknown
  color?: unknown
  dataIndex?: number
  data?: unknown
}

export interface ValueStyleLike {
  y: ValueFormat
  currency: string | null
}

const MAX_LABEL = 22
export const PERCENT: ValueStyleLike = { y: 'percent', currency: null }
export const PLAIN: ValueStyleLike = { y: 'number', currency: null }

export const truncate = (text: string, max = MAX_LABEL) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  )
}

export const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

export const yName = (spec: ChartSpec) =>
  spec.y.length === 1 && spec.y[0] ? humanizeName(spec.y[0]) : null
export const xName = (spec: ChartSpec) => (spec.x ? humanizeName(spec.x) : null)

/** The value cell's style in tooltips: tabular figures, a little weight. */
const VALUE_CSS = 'font-variant-numeric:tabular-nums;font-weight:600;margin-left:16px'

/** One tooltip row: a colour swatch (ECharts' own escaped marker), the name, the value. */
export function tooltipRow(marker: unknown, name: string, value: string): string {
  return `<div style="display:flex;align-items:center;justify-content:space-between;line-height:1.7"><span>${typeof marker === 'string' ? marker : ''}${escapeHtml(truncate(name, 32))}</span><span style="${VALUE_CSS}">${value}</span></div>`
}

export function tooltipHeader(text: string): string {
  return `<div style="font-weight:600;margin-bottom:2px">${escapeHtml(truncate(text, 40))}</div>`
}

/** An axis tooltip: the category or date, then one row per series. */
export function axisTooltip(
  format: (value: number | null, param: Param) => string,
  header?: (params: Param[]) => string,
) {
  return (input: Param | Param[]) => {
    const params = Array.isArray(input) ? input : [input]
    const [first] = params
    const title =
      header?.(params) ?? String(first?.axisValueLabel ?? first?.axisValue ?? first?.name ?? '')
    const rows = params
      .filter((param) => param.seriesName !== undefined)
      .map((param) => {
        const value = Array.isArray(param.value) ? param.value.at(-1) : param.value
        return tooltipRow(
          param.marker,
          String(param.seriesName ?? ''),
          format(numberOf(value), param),
        )
      })
    return tooltipHeader(title) + rows.join('')
  }
}

export function base(ctx: OptionContext, legend: boolean, decals: boolean): EChartsOption {
  const { theme } = ctx
  return {
    animation: ctx.animation,
    animationDuration: 550,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 300,
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
      borderWidth: 1,
      padding: [8, 12],
      extraCssText: `border-radius:10px;box-shadow:0 10px 30px -12px ${withAlpha('#000000', theme.mode === 'dark' ? 0.6 : 0.22)};`,
      textStyle: { color: theme.text, fontSize: 12, fontFamily: FONT_FAMILY },
    },
    legend: legend
      ? {
          type: 'scroll',
          bottom: 0,
          icon: 'circle',
          itemWidth: 8,
          itemHeight: 8,
          itemGap: 16,
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

/** Hover one series: the others fade, so it reads on its own. */
export const FOCUS = {
  emphasis: { focus: 'series' as const },
  blur: {
    itemStyle: { opacity: 0.25 },
    lineStyle: { opacity: 0.25 },
    areaStyle: { opacity: 0.08 },
  },
}

/** Rounded bar ends, on the side away from the axis. */
export const barRadius = (horizontal: boolean): [number, number, number, number] =>
  horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]

/** A soft vertical fade from a series colour, for area fills. */
export function fade(color: string, strength = 0.32) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, strength) },
      { offset: 1, color: withAlpha(color, 0) },
    ],
  }
}

/** 1,234 → 2,000; 630,000 → 700,000: a round axis end just past `value`. */
function niceCeil(value: number): number {
  if (value <= 0) return 0
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / magnitude) * magnitude
}

/** A target line outside the data (F-VIZ-08) stretches the axis so the line stays visible. */
function targetRange(spec: ChartSpec, values: number[]): { max?: number; min?: number } {
  const target = spec.annotations?.target ?? null
  if (target === null || values.length === 0) return {}
  const max = Math.max(...values)
  const min = Math.min(...values)
  if (target > max) return { max: niceCeil(target * 1.05) }
  if (target < min && target < 0) return { min: -niceCeil(-target * 1.05) }
  return {}
}

export function valueAxis(
  spec: ChartSpec,
  ctx: OptionContext,
  name: string | null,
  values: number[],
  horizontal = false,
  format: ValueStyleLike = spec.format,
) {
  const log = spec.logScale && values.length > 0 && values.every((value) => value > 0)
  return {
    type: log ? ('log' as const) : ('value' as const),
    ...(log ? {} : targetRange(spec, values)),
    name: name ?? undefined,
    // Vertical axes carry their title on top; horizontal ones below, centered.
    ...(horizontal
      ? { nameLocation: 'middle' as const, nameGap: 28, nameTextStyle: { color: ctx.theme.muted } }
      : { nameTextStyle: { color: ctx.theme.muted, align: 'left' as const } }),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: ctx.theme.muted,
      // Narrow charts (a phone, a small tile) drop labels that would collide (D118).
      hideOverlap: true,
      formatter: (value: number) => formatValue(value, format, ctx.locale, { compact: true }),
    },
    splitLine: { lineStyle: { color: ctx.theme.grid, type: [4, 4] as number[] } },
  }
}

export function categoryAxis(
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

/** Category labels for moments in time ("Jan 2025"), else the labels as they are. */
export function categoryLabels(
  categories: string[],
  times: number[] | null | undefined,
  ctx: OptionContext,
) {
  if (!times || times.length !== categories.length) return categories
  const span = times.length > 1 ? (times.at(-1) ?? 0) - (times[0] ?? 0) : 0
  return times.map((time) => formatDateTick(time, ctx.locale, span))
}

export function labelOf(
  spec: ChartSpec,
  ctx: OptionContext,
  position: 'top' | 'right' | 'inside',
  format: ValueStyleLike = spec.format,
) {
  return spec.labels
    ? {
        show: true,
        position,
        color: position === 'inside' ? '#ffffff' : ctx.theme.text,
        fontSize: 11,
        formatter: (params: Param | Param[]) => {
          const param = (Array.isArray(params) ? params[0] : params) ?? {}
          const value = Array.isArray(param.value) ? param.value.at(-1) : param.value
          return formatValue(numberOf(value), format, ctx.locale, { compact: true })
        },
      }
    : { show: false }
}

export const valueFormatter = (spec: ChartSpec, ctx: OptionContext) => (value: unknown) =>
  formatValue(numberOf(value), spec.format, ctx.locale)
