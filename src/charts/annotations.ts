import type { MarkLineComponentOption, MarkPointComponentOption } from 'echarts'
import { ANNOTATABLE, type ChartSpec } from '@/charts/spec'
import type { ChartTheme } from '@/charts/theme'
import { formatValue } from '@/lib/format'

// Chart annotations (F-VIZ-08) as ECharts markPoint / markLine on a series. Every mark carries a text
// label ("Average 1.2M", "Target 500K", the value on a max/min pin), so no meaning rests on colour.
// Stacked series get only the target line: per-series extremes and averages would mislead there.

interface MarkContext {
  theme: ChartTheme
  locale: string
}

type MarkParam = { value?: unknown }

const numberOf = (value: unknown) => (typeof value === 'number' ? value : Number(value))

type LineData = NonNullable<MarkLineComponentOption['data']>[number]

export function seriesMarks(
  spec: ChartSpec,
  ctx: MarkContext,
  { horizontal, first }: { horizontal: boolean; first: boolean },
): { markPoint?: MarkPointComponentOption; markLine?: MarkLineComponentOption } {
  const annotations = spec.annotations
  if (!annotations || !ANNOTATABLE.has(spec.type)) return {}
  const fmt = (value: unknown) =>
    formatValue(numberOf(value), spec.format, ctx.locale, { compact: true })
  const perSeries = !spec.stacked
  const lines: LineData[] = []
  if (annotations.average && perSeries) {
    lines.push({
      type: 'average' as const,
      name: 'Average',
      lineStyle: { type: 'dashed' as const, color: ctx.theme.muted, width: 1.5 },
      label: {
        formatter: (param: MarkParam) => `Average ${fmt(param.value)}`,
        position: 'insideEndTop' as const,
        color: ctx.theme.muted,
      },
    })
  }
  if (annotations.target !== null && first) {
    const target = annotations.target
    lines.push({
      ...(horizontal ? { xAxis: target } : { yAxis: target }),
      name: 'Target',
      lineStyle: { type: 'solid' as const, color: ctx.theme.text, width: 1.5 },
      label: {
        formatter: () => `Target ${fmt(target)}`,
        position: 'insideEndTop' as const,
        color: ctx.theme.text,
      },
    })
  }
  return {
    ...(annotations.extremes && perSeries
      ? {
          markPoint: {
            symbol: 'pin',
            symbolSize: 40,
            data: [
              { type: 'max' as const, name: 'Highest' },
              { type: 'min' as const, name: 'Lowest' },
            ],
            label: { formatter: (param: MarkParam) => fmt(param.value), fontSize: 10 },
          },
        }
      : {}),
    ...(lines.length > 0
      ? {
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: lines,
            animation: false,
          },
        }
      : {}),
  }
}

/** The annotations in words, for the chart's text alternative. */
export function describeAnnotations(spec: ChartSpec, values: readonly number[], locale: string) {
  const annotations = spec.annotations
  if (!annotations || !ANNOTATABLE.has(spec.type) || values.length === 0) return ''
  const fmt = (value: number) => formatValue(value, spec.format, locale)
  const parts: string[] = []
  if (annotations.extremes && !spec.stacked) parts.push('highest and lowest values marked')
  if (annotations.average && !spec.stacked) {
    parts.push(`average line at ${fmt(values.reduce((a, b) => a + b, 0) / values.length)}`)
  }
  if (annotations.target !== null) parts.push(`target line at ${fmt(annotations.target)}`)
  return parts.length > 0 ? ` With ${parts.join(', ')}.` : ''
}
