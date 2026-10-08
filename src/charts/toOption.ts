import type { EChartsOption } from 'echarts'
import { describeAnnotations } from '@/charts/annotations'
import { categoryOption, comboOption, waterfallOption } from '@/charts/options/bars'
import type { OptionContext } from '@/charts/options/common'
import { binsOption, boxplotOption, heatmapOption, scatterOption } from '@/charts/options/spread'
import { calendarOption, timeOption } from '@/charts/options/time'
import { funnelOption, pieOption, sankeyOption, treemapOption } from '@/charts/options/whole'
import type { Prepared } from '@/charts/shape'
import { CHART_TYPE_LABELS, type ChartSpec } from '@/charts/spec'
import { formatValue } from '@/lib/format'

// (spec, prepared data, theme, locale) → ECharts option (ui rules). Pure; snapshot-tested. The
// option builders live in src/charts/options/, by family; the shared style is options/common.ts.

export { escapeHtml, type OptionContext } from '@/charts/options/common'

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
    case 'combo':
      return comboOption(spec, prepared, ctx)
    case 'waterfall':
      return waterfallOption(spec, prepared, ctx)
    case 'funnel':
      return funnelOption(spec, prepared, ctx)
    case 'treemap':
      return treemapOption(spec, prepared, ctx)
    case 'boxplot':
      return boxplotOption(spec, prepared, ctx)
    case 'sankey':
      return sankeyOption(spec, prepared, ctx)
    case 'calendar':
      return calendarOption(spec, prepared, ctx)
    case 'kpi':
    case 'table':
      return null
  }
}

const PERCENT = { y: 'percent' as const, currency: null }

/** "up 8%" / "down 3%" / "unchanged", for a KPI's trend. */
function moved(value: number | null, previous: number | null | undefined, locale: string): string {
  if (value === null || previous === null || previous === undefined || previous === 0) return ''
  if (value === previous) return ' (unchanged)'
  const ratio = (value - previous) / Math.abs(previous)
  return ` (${ratio > 0 ? 'up' : 'down'} ${formatValue(Math.abs(ratio), PERCENT, locale)} from the period before)`
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
      return `${kind}: ${spec.title}. ${prepared.categories.length} categories${prepared.series.length > 1 ? `, ${prepared.series.length} series` : ''}.${extremes}${describeAnnotations(
        spec,
        pairs.map((pair) => pair.value),
        locale,
      )}`
    }
    case 'time': {
      const [first] = prepared.series
      const points = first?.points ?? []
      const start = points[0]?.[1] ?? null
      const end = points.at(-1)?.[1] ?? null
      const values = points.map(([, y]) => y).filter((y): y is number => y !== null)
      return `${kind}: ${spec.title}. ${prepared.series.length} ${prepared.series.length === 1 ? 'line' : 'lines'} of ${points.length} points${first ? `; ${first.name} goes from ${fmt(start)} to ${fmt(end)}` : ''}.${describeAnnotations(spec, values, locale)}`
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
    case 'combo': {
      const top = prepared.categories
        .map((name, i) => ({ name, value: prepared.bars.values[i] ?? null }))
        .filter((pair): pair is { name: string; value: number } => pair.value !== null)
        .sort((a, b) => b.value - a.value)[0]
      return `${kind}: ${spec.title}. ${prepared.categories.length} categories; bars show ${prepared.bars.name.toLowerCase()}${top ? ` (highest ${top.name}, ${fmt(top.value)})` : ''}, the line ${prepared.line.name.toLowerCase()} on its own axis.`
    }
    case 'waterfall': {
      const sorted = [...prepared.steps].sort((a, b) => b.value - a.value)
      const up = sorted[0]
      const down = sorted.at(-1)
      return `${kind}: ${spec.title}. ${prepared.steps.length} steps adding up to ${fmt(prepared.total)}.${up && up.value > 0 ? ` Biggest rise ${up.name} (${fmt(up.value)}).` : ''}${down && down.value < 0 ? ` Biggest fall ${down.name} (${fmt(down.value)}).` : ''}`
    }
    case 'funnel':
      return `${kind}: ${spec.title}. ${prepared.stages
        .map((stage) => `${stage.name} ${fmt(stage.value)}`)
        .join(', ')}.`
    case 'treemap': {
      const leaves = prepared.nodes
        .flatMap((node) => node.children ?? [node])
        .sort((a, b) => b.value - a.value)
      const top = leaves
        .slice(0, 3)
        .map((leaf) => `${leaf.name} (${fmt(leaf.value)})`)
        .join(', ')
      return `${kind}: ${spec.title}. ${leaves.length} tiles${top ? `; largest ${top}` : ''}.`
    }
    case 'boxplot': {
      const byMedian = [...prepared.groups].sort((a, b) => b.stats[2] - a.stats[2])
      const high = byMedian[0]
      const low = byMedian.at(-1)
      return `${kind}: ${spec.title}. ${prepared.groups.length} groups${high && low ? `; medians from ${fmt(low.stats[2])} (${low.name}) to ${fmt(high.stats[2])} (${high.name})` : ''}.`
    }
    case 'sankey': {
      const names = new Map(prepared.nodes.map((node) => [node.id, node.name]))
      const top = [...prepared.links].sort((a, b) => b.value - a.value)[0]
      return `${kind}: ${spec.title}. ${prepared.links.length} flows${top ? `; the largest is ${names.get(top.source) ?? ''} to ${names.get(top.target) ?? ''} (${fmt(top.value)})` : ''}.`
    }
    case 'calendar': {
      const first = prepared.days[0]?.[0] ?? ''
      const last = prepared.days.at(-1)?.[0] ?? ''
      return `${kind}: ${spec.title}. ${prepared.days.length} days from ${first} to ${last}; values from ${fmt(prepared.min)} to ${fmt(prepared.max)}.`
    }
    case 'kpi':
      return prepared.items
        .map(
          (item) => `${item.label}: ${fmt(item.value)}${moved(item.value, item.previous, locale)}`,
        )
        .join('. ')
    case 'table':
      return spec.reason
  }
}
