import type { AnswerSummary } from '@/ai/schemas'
import type { Prepared } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { formatNumber, formatTimePoint, formatValue, humanizeName, pluralize } from '@/lib/format'

// F-ASK-11 for the v2 chart types (F-VIZ-09, F-VIZ-10): the local headline for KPIs with a trend,
// bar-and-line, waterfall, funnel, treemap, box plot, sankey and calendar charts. No LLM.

export interface SummaryContext {
  spec: ChartSpec
  locale: string
  /** Formats a value of the chart's (first) measure. */
  fmt: (value: number | null) => string
  measureLower: string
  xNoun: string
  caveats: string[]
}

const PERCENT = { y: 'percent' as const, currency: null }

function share(value: number, total: number, locale: string): string {
  return formatValue(total > 0 ? value / total : null, PERCENT, locale)
}

/** "up 8% from Feb 2025" / "down 3%" / "unchanged". */
function movement(value: number, previous: number, locale: string, when: string): string {
  if (previous === 0 || value === previous)
    return value === previous ? `unchanged from ${when}` : ''
  const ratio = (value - previous) / Math.abs(previous)
  const size = formatValue(Math.abs(ratio), PERCENT, locale)
  return `${ratio > 0 ? 'up' : 'down'} ${size} from ${when}`
}

type KpiPrepared = Extract<Prepared, { kind: 'kpi' }>

/** A KPI over time (F-VIZ-10): the latest value and how it moved since the period before. */
export function summarizeKpiTrend(
  prepared: KpiPrepared,
  ctx: SummaryContext,
): AnswerSummary | null {
  const { period } = prepared
  const [first, ...rest] = prepared.items
  if (!period || !first) return null
  const step =
    typeof period.latest === 'number' && typeof period.previous === 'number'
      ? period.latest - period.previous
      : 86_400_000
  const when = (at: number | string) =>
    typeof at === 'number' ? formatTimePoint(at, ctx.locale, step) : at
  const line = (item: KpiPrepared['items'][number]) => {
    const moved =
      item.value !== null &&
      item.previous !== null &&
      item.previous !== undefined &&
      period.previous !== null
        ? movement(item.value, item.previous, ctx.locale, when(period.previous))
        : ''
    return `${item.label}: ${ctx.fmt(item.value)} in ${when(period.latest)}${moved ? `, ${moved}` : ''}.`
  }
  return { headline: line(first), bullets: rest.map(line), caveats: ctx.caveats }
}

export function summarizeMore(prepared: Prepared, ctx: SummaryContext): AnswerSummary | null {
  const { fmt, locale, caveats } = ctx
  switch (prepared.kind) {
    case 'combo': {
      const pairs = prepared.categories.map((name, i) => ({
        name,
        bar: prepared.bars.values[i] ?? null,
        line: prepared.line.values[i] ?? null,
      }))
      const topBar = [...pairs]
        .filter((p) => p.bar !== null)
        .sort((a, b) => (b.bar ?? 0) - (a.bar ?? 0))[0]
      const topLine = [...pairs]
        .filter((p) => p.line !== null)
        .sort((a, b) => (b.line ?? 0) - (a.line ?? 0))[0]
      if (!topBar) return null
      const lineStyle = ctx.spec.format2 ?? { y: 'number' as const, currency: null }
      return {
        headline: `${topBar.name} has the highest ${prepared.bars.name.toLowerCase()} (${fmt(topBar.bar)}).`,
        bullets: topLine
          ? [
              `Highest ${prepared.line.name.toLowerCase()}: ${topLine.name} (${formatValue(topLine.line, lineStyle, locale, { compact: true })}).`,
            ]
          : [],
        caveats,
      }
    }
    case 'waterfall': {
      const rises = [...prepared.steps].sort((a, b) => b.value - a.value)
      const up = rises[0]
      const down = rises.at(-1)
      if (!up) return null
      // fmt already signs measures named as changes ("profit_change"); never sign twice.
      const signed = (value: number) => {
        const text = fmt(value)
        return value > 0 && !text.startsWith('+') ? `+${text}` : text
      }
      const bullets = [
        up.value > 0 ? `Biggest rise: ${up.name} (${signed(up.value)}).` : null,
        down && down.value < 0 ? `Biggest fall: ${down.name} (${signed(down.value)}).` : null,
      ].filter((bullet): bullet is string => bullet !== null)
      return {
        headline: `The ${prepared.steps.length} ${pluralize(ctx.xNoun)} add up to ${signed(prepared.total)} ${ctx.measureLower}.`,
        bullets,
        caveats,
      }
    }
    case 'funnel': {
      const first = prepared.stages[0]
      const last = prepared.stages.at(-1)
      if (!first || !last || first === last) return null
      const biggest = prepared.stages.reduce<{ from: string; to: string; lost: number } | null>(
        (best, stage, i) => {
          const before = prepared.stages[i - 1]
          if (!before || before.value <= 0) return best
          const lost = (before.value - stage.value) / before.value
          return !best || lost > best.lost ? { from: before.name, to: stage.name, lost } : best
        },
        null,
      )
      return {
        headline: `${last.name} keeps ${share(last.value, first.value, locale)} of ${first.name} (${fmt(last.value)} of ${fmt(first.value)}).`,
        bullets: biggest
          ? [
              `Biggest drop: ${biggest.from} → ${biggest.to} (${formatValue(biggest.lost, PERCENT, locale)} lost).`,
            ]
          : [],
        caveats,
      }
    }
    case 'treemap': {
      const leaves = prepared.nodes.flatMap((node) => node.children ?? [node])
      const top = [...leaves].filter((leaf) => !leaf.other).sort((a, b) => b.value - a.value)[0]
      if (!top || prepared.total <= 0) return null
      return {
        headline: `${top.name} is the largest ${ctx.xNoun}, with ${share(top.value, prepared.total, locale)} of the total ${ctx.measureLower}.`,
        bullets: [`${formatNumber(leaves.length, locale)} ${pluralize(ctx.xNoun)} in all.`],
        caveats,
      }
    }
    case 'boxplot': {
      const byMedian = [...prepared.groups].sort((a, b) => b.stats[2] - a.stats[2])
      const top = byMedian[0]
      const bottom = byMedian.at(-1)
      const widest = [...prepared.groups].sort(
        (a, b) => b.stats[3] - b.stats[1] - (a.stats[3] - a.stats[1]),
      )[0]
      if (!top) return null
      const bullets = [
        widest
          ? `Widest middle half: ${widest.name} (${fmt(widest.stats[1])} to ${fmt(widest.stats[3])}).`
          : null,
      ].filter((bullet): bullet is string => bullet !== null)
      return {
        headline: `${top.name} has the highest median ${ctx.measureLower} (${fmt(top.stats[2])})${bottom && bottom !== top ? `; ${bottom.name} the lowest (${fmt(bottom.stats[2])})` : ''}.`,
        bullets,
        caveats,
      }
    }
    case 'sankey': {
      const names = new Map(prepared.nodes.map((node) => [node.id, node.name]))
      const top = [...prepared.links].sort((a, b) => b.value - a.value)[0]
      if (!top) return null
      const sources = prepared.nodes.filter((node) => node.side === 'source').length
      const targets = prepared.nodes.length - sources
      const from = humanizeName(ctx.spec.x ?? 'source').toLowerCase()
      const to = humanizeName(ctx.spec.series ?? 'target').toLowerCase()
      return {
        headline: `The biggest flow is ${names.get(top.source) ?? ''} → ${names.get(top.target) ?? ''} (${fmt(top.value)}).`,
        bullets: [
          `${formatNumber(prepared.links.length, locale)} flows from ${formatNumber(sources, locale)} ${sources === 1 ? from : pluralize(from)} to ${formatNumber(targets, locale)} ${targets === 1 ? to : pluralize(to)}.`,
        ],
        caveats,
      }
    }
    case 'calendar': {
      const days = prepared.days.filter((day): day is [string, number] => day[1] !== null)
      const sorted = [...days].sort((a, b) => b[1] - a[1])
      const high = sorted[0]
      const low = sorted.at(-1)
      if (!high || !low) return null
      return {
        headline: `${humanizeName(ctx.spec.y[0] ?? 'value')} was highest on ${high[0]} (${fmt(high[1])}).`,
        bullets: [
          `Lowest on ${low[0]} (${fmt(low[1])}), across ${formatNumber(days.length, locale)} days.`,
        ],
        caveats,
      }
    }
    default:
      return null
  }
}
