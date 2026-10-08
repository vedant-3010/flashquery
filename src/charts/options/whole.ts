import type { EChartsOption } from 'echarts'
import {
  base,
  numberOf,
  PERCENT,
  tooltipHeader,
  tooltipRow,
  truncate,
  valueFormatter,
  yName,
  type OptionContext,
  type Param,
} from '@/charts/options/common'
import { OTHER, type Prepared, type TreeNode } from '@/charts/prepared'
import type { ChartSpec } from '@/charts/spec'
import { withAlpha } from '@/charts/theme'
import { formatValue } from '@/lib/format'

// Parts of a whole: donut, funnel, treemap and sankey. Pure.

export function pieOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'pie' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const shell = base(ctx, true, true)
  return {
    ...shell,
    tooltip: { ...shell.tooltip, trigger: 'item', valueFormatter: valueFormatter(spec, ctx) },
    series: [
      {
        type: 'pie',
        name: yName(spec) ?? '',
        radius: ['48%', '72%'],
        center: ['50%', '46%'],
        padAngle: 1.5,
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: theme.background, borderWidth: 1 },
        emphasis: { scaleSize: 4 },
        label: {
          color: theme.text,
          formatter: (param: Param & { percent?: number }) =>
            `${truncate(String(param.name ?? ''), 18)}\n${formatValue((param.percent ?? 0) / 100, PERCENT, locale)}`,
        },
        labelLine: { lineStyle: { color: theme.axis } },
        data: prepared.slices.map((slice) => ({
          name: slice.name,
          value: slice.value,
          itemStyle: slice.name === OTHER ? { color: theme.other } : undefined,
        })),
      },
    ],
  }
}

export function funnelOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'funnel' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const first = prepared.stages[0]?.value ?? 0
  const share = (value: number | null) =>
    formatValue(first > 0 && value !== null ? value / first : null, PERCENT, locale)
  const compact = (value: number | null) =>
    formatValue(value, spec.format, locale, { compact: true })
  const color = theme.palette[0] ?? theme.text
  const last = Math.max(1, prepared.stages.length - 1)
  const shell = base(ctx, false, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) ?? {}
        const value = numberOf(param.value)
        return (
          tooltipHeader(String(param.name ?? '')) +
          tooltipRow(
            param.marker,
            yName(spec) ?? 'Value',
            formatValue(value, spec.format, locale),
          ) +
          tooltipRow('', 'Of the first stage', share(value))
        )
      },
    },
    series: [
      {
        type: 'funnel',
        name: yName(spec) ?? '',
        sort: 'none',
        left: '2%',
        right: '38%',
        top: 12,
        bottom: 12,
        minSize: '14%',
        maxSize: '100%',
        gap: 3,
        // Stages share one colour that fades as they narrow; the label names each one.
        label: {
          show: true,
          position: 'right',
          color: theme.text,
          formatter: (param: Param) =>
            `${truncate(String(param.name ?? ''), 22)}  ${compact(numberOf(param.value))} · ${share(numberOf(param.value))}`,
        },
        labelLine: { show: true, lineStyle: { color: theme.axis } },
        emphasis: { label: { fontWeight: 600 } },
        data: prepared.stages.map((stage, i) => ({
          name: stage.name,
          value: stage.value,
          itemStyle: { color: withAlpha(color, 1 - (0.5 * i) / last) },
        })),
      },
    ],
  }
}

export function treemapOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'treemap' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const grouped = prepared.nodes.some((node) => node.children)
  const compact = (value: unknown) =>
    formatValue(numberOf(value), spec.format, locale, { compact: true })
  // Tiles are tints of their colour, deeper for bigger values, with the theme's text on top:
  // readable in both themes (about 5:1 or better). Explicit colours, not ECharts' level mapping.
  const accent = theme.palette[0] ?? theme.text
  const tint = (color: string, value: number, siblings: TreeNode[]) => {
    const values = siblings.map((node) => node.value)
    const [min, max] = [Math.min(...values), Math.max(...values)]
    const t = max > min ? (value - min) / (max - min) : 1
    return withAlpha(color, 0.16 + 0.44 * t)
  }
  const toData = (node: TreeNode, color: string, siblings: TreeNode[]): object => ({
    name: node.name,
    value: node.value,
    itemStyle: {
      color: node.other ? withAlpha(theme.other, 0.3) : tint(color, node.value, siblings),
    },
    ...(node.children
      ? {
          // A group's own fill shows as the strip behind its name.
          itemStyle: { color: withAlpha(color, 0.3) },
          children: node.children.map((child) => toData(child, color, node.children ?? [])),
        }
      : {}),
  })
  const data = prepared.nodes.map((node, i) =>
    toData(
      node,
      grouped ? (theme.palette[i % theme.palette.length] ?? accent) : accent,
      prepared.nodes,
    ),
  )
  const shell = base(ctx, false, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) ?? {}
        const value = numberOf(param.value)
        return (
          tooltipHeader(String(param.name ?? '')) +
          tooltipRow(
            param.marker,
            yName(spec) ?? 'Value',
            formatValue(value, spec.format, locale),
          ) +
          tooltipRow(
            '',
            'Share of the total',
            formatValue(
              value !== null && prepared.total > 0 ? value / prepared.total : null,
              PERCENT,
              locale,
            ),
          )
        )
      },
    },
    series: [
      {
        type: 'treemap',
        name: yName(spec) ?? '',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        label: {
          show: true,
          color: theme.text,
          fontSize: 12,
          overflow: 'truncate',
          formatter: (param: Param) => `${String(param.name ?? '')}\n${compact(param.value)}`,
        },
        upperLabel: grouped
          ? { show: true, height: 22, color: theme.text, fontWeight: 600 }
          : { show: false },
        itemStyle: { borderColor: theme.background, borderWidth: 1, gapWidth: 2, borderRadius: 4 },
        levels: [{ itemStyle: { gapWidth: grouped ? 3 : 2 } }, { itemStyle: { gapWidth: 1 } }],
        data,
      },
    ],
  }
}

export function sankeyOption(
  spec: ChartSpec,
  prepared: Extract<Prepared, { kind: 'sankey' }>,
  ctx: OptionContext,
): EChartsOption {
  const { theme, locale } = ctx
  const names = new Map(prepared.nodes.map((node) => [node.id, node.name]))
  const sources = prepared.nodes.filter((node) => node.side === 'source')
  const colorOf = new Map(
    sources.map((node, i) => [node.id, theme.palette[i % theme.palette.length] ?? theme.text]),
  )
  const fmt = (value: unknown) => formatValue(numberOf(value), spec.format, locale)
  const shell = base(ctx, false, false)
  return {
    ...shell,
    tooltip: {
      ...shell.tooltip,
      trigger: 'item',
      formatter: (input: Param | Param[]) => {
        const param = (Array.isArray(input) ? input[0] : input) as Param & {
          dataType?: string
          data?: { source?: string; target?: string; value?: number }
        }
        if (param.dataType === 'edge') {
          const link = param.data ?? {}
          return (
            tooltipHeader(
              `${names.get(link.source ?? '') ?? ''} → ${names.get(link.target ?? '') ?? ''}`,
            ) + tooltipRow(param.marker, yName(spec) ?? 'Value', fmt(link.value))
          )
        }
        return (
          tooltipHeader(names.get(String(param.name ?? '')) ?? '') +
          tooltipRow(param.marker, yName(spec) ?? 'Value', fmt(param.value))
        )
      },
    },
    series: [
      {
        type: 'sankey',
        name: yName(spec) ?? '',
        left: 8,
        right: 112,
        top: 12,
        bottom: 12,
        nodeWidth: 12,
        nodeGap: 10,
        nodeAlign: 'justify',
        layoutIterations: 32,
        draggable: false,
        emphasis: { focus: 'adjacency' },
        label: {
          color: theme.text,
          fontSize: 12,
          formatter: (param: Param) => truncate(names.get(String(param.name ?? '')) ?? '', 20),
        },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
        itemStyle: { borderWidth: 0 },
        data: prepared.nodes.map((node) => ({
          name: node.id,
          itemStyle: { color: colorOf.get(node.id) ?? theme.other },
        })),
        links: prepared.links,
      },
    ],
  }
}
