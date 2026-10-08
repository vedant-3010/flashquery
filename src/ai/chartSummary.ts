import type { AnswerSummary } from '@/ai/schemas'
import { summarizeKpiTrend, summarizeMore } from '@/ai/chartSummaryMore'
import { isAdditiveName } from '@/charts/classify'
import { prepare, type ChartData, type Prepared } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { formatNumber, formatTimePoint, formatValue, humanizeName, pluralize } from '@/lib/format'

// F-ASK-11: the local headline, written from the chosen chart and its data (no LLM), e.g.
// "APAC leads with +142%, followed by LATAM (+64%)". Used in Strict and demo mode, and shown
// until the AI summary arrives in Balanced mode.

const SIGNED = /(growth|change|delta|diff)/i

function strength(r: number): string {
  const size = Math.abs(r)
  if (size < 0.1) return 'no clear'
  const word = size < 0.3 ? 'a weak' : size < 0.6 ? 'a moderate' : 'a strong'
  return `${word} ${r > 0 ? 'positive' : 'negative'}`
}

/** Pearson correlation of the points' x and y. */
export function correlation(points: [number, number, ...unknown[]][]): number | null {
  const n = points.length
  if (n < 3) return null
  let sx = 0
  let sy = 0
  for (const [x, y] of points) {
    sx += x
    sy += y
  }
  const mx = sx / n
  const my = sy / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (const [x, y] of points) {
    cov += (x - mx) * (y - my)
    vx += (x - mx) ** 2
    vy += (y - my) ** 2
  }
  return vx === 0 || vy === 0 ? null : cov / Math.sqrt(vx * vy)
}

type Ranked = { name: string; value: number }

function ranked(names: string[], values: (number | null)[]): Ranked[] {
  return names
    .map((name, i) => ({ name, value: values[i] ?? null }))
    .filter((pair): pair is Ranked => pair.value !== null)
    .sort((a, b) => b.value - a.value)
}

function minStep(times: number[]): number {
  let step = Number.POSITIVE_INFINITY
  for (let i = 1; i < times.length; i += 1) {
    const diff = (times[i] ?? 0) - (times[i - 1] ?? 0)
    if (diff > 0) step = Math.min(step, diff)
  }
  return Number.isFinite(step) ? step : 86_400_000
}

function change(first: number, last: number, locale: string): string | null {
  if (first === 0) return null
  const ratio = (last - first) / Math.abs(first)
  const text = formatValue(ratio, { y: 'percent', currency: null }, locale)
  return ratio > 0 ? `+${text}` : text
}

/** A summary for charts; null for tables (summary.ts then reads the result's shape). */
export function summarizeChart(
  spec: ChartSpec,
  data: ChartData,
  locale: string,
): AnswerSummary | null {
  const additive = spec.y.every(isAdditiveName)
  const prepared: Prepared = prepare(spec, data, additive)
  const signed = SIGNED.test(spec.y[0] ?? '')
  const fmt = (value: number | null) => {
    const text = formatValue(value, spec.format, locale, { compact: true })
    return signed && value !== null && value > 0 ? `+${text}` : text
  }
  const measure = humanizeName(spec.y[0] ?? 'value')
  const measureLower = measure.toLowerCase()
  const xNoun = humanizeName(spec.x ?? 'category').toLowerCase()
  const notes = 'notes' in prepared ? prepared.notes : []
  const caveats = [...notes]
  const more = { spec, locale, fmt, measureLower, xNoun, caveats }

  switch (prepared.kind) {
    case 'kpi': {
      if (prepared.period) return summarizeKpiTrend(prepared, more)
      const [first, ...rest] = prepared.items
      if (!first) return null
      const where = prepared.caption ? ` (${prepared.caption})` : ''
      return {
        headline: `${first.label}${where}: ${fmt(first.value)}.`,
        bullets: rest.slice(0, 3).map((item) => `${item.label}: ${fmt(item.value)}.`),
        caveats,
      }
    }
    case 'time': {
      const continuous = prepared.axis === 'time'
      const times = continuous ? (prepared.series[0]?.points.map(([x]) => Number(x)) ?? []) : []
      const step = minStep(times)
      const when = (x: number | string) =>
        continuous ? formatTimePoint(Number(x), locale, step) : String(x)
      if (spec.series) {
        const allTimes = prepared.series.flatMap((s) => s.points.map(([x]) => Number(x)))
        const lastX: number | string | null = continuous
          ? allTimes.length > 0
            ? Math.max(...allTimes)
            : null
          : (prepared.categories.at(-1) ?? null)
        const atLast = prepared.series
          .filter((s) => !s.other)
          .map((s) => ({
            name: s.name,
            value: [...s.points].reverse().find(([, y]) => y !== null)?.[1] ?? null,
          }))
          .filter((pair): pair is Ranked => pair.value !== null)
          .sort((a, b) => b.value - a.value)
        const [top, second] = atLast
        if (!top) return null
        const period = lastX === null ? 'the latest period' : when(lastX)
        const seriesNoun = pluralize(humanizeName(spec.series).toLowerCase())
        return {
          headline: `In ${period}, ${top.name} leads with ${fmt(top.value)}${second ? `, followed by ${second.name} (${fmt(second.value)})` : ''}.`,
          bullets: [
            `${prepared.series.length} ${seriesNoun} across ${formatNumber(prepared.series[0]?.points.length ?? 0, locale)} points.`,
          ],
          caveats,
        }
      }
      const lines = prepared.series.map((s) => {
        const points = s.points.filter((p): p is [number | string, number] => p[1] !== null)
        return { name: s.name, points }
      })
      const [main, ...others] = lines
      const first = main?.points[0]
      const last = main?.points.at(-1)
      if (!main || !first || !last || first === last) return null
      const sorted = [...main.points].sort((a, b) => b[1] - a[1])
      const high = sorted[0]
      const low = sorted.at(-1)
      const delta = change(first[1], last[1], locale)
      const bullets = [
        high ? `Highest: ${fmt(high[1])} in ${when(high[0])}.` : null,
        low ? `Lowest: ${fmt(low[1])} in ${when(low[0])}.` : null,
        ...others.slice(0, 1).map((line) => {
          const a = line.points[0]
          const b = line.points.at(-1)
          return a && b ? `${line.name}: ${fmt(a[1])} → ${fmt(b[1])}.` : null
        }),
      ].filter((bullet): bullet is string => bullet !== null)
      return {
        headline: `${main.name} went from ${fmt(first[1])} in ${when(first[0])} to ${fmt(last[1])} in ${when(last[0])}${delta ? ` (${delta})` : ''}.`,
        bullets,
        caveats,
      }
    }
    case 'category': {
      const byMeasure = !spec.series
      if (byMeasure) {
        const [main, ...others] = prepared.series
        if (!main) return null
        const pairs = ranked(prepared.categories, main.values)
        const [top, second] = pairs
        const bottom = pairs.at(-1)
        if (!top) return null
        const leader = spec.sort !== 'none'
        const headline =
          leader && second
            ? `${top.name} leads with ${fmt(top.value)}, followed by ${second.name} (${fmt(second.value)}).`
            : `${top.name} has the highest ${measureLower} (${fmt(top.value)})${bottom && bottom !== top ? `; ${bottom.name} the lowest (${fmt(bottom.value)})` : ''}.`
        const bullets = [
          `${formatNumber(pairs.length, locale)} ${pairs.length === 1 ? xNoun : pluralize(xNoun)} compared.`,
        ]
        if (leader && bottom && pairs.length > 2)
          bullets.push(`Lowest: ${bottom.name} (${fmt(bottom.value)}).`)
        for (const other of others.slice(0, 2)) {
          const [best] = ranked(prepared.categories, other.values)
          if (best) {
            bullets.push(
              `Highest ${other.name.toLowerCase()}: ${best.name} (${formatValue(best.value, spec.format, locale, { compact: true })}).`,
            )
          }
        }
        return { headline, bullets: bullets.slice(0, 3), caveats }
      }
      // Split by series: compare totals when they add up, else the single highest cell.
      const seriesNoun = humanizeName(spec.series ?? 'series').toLowerCase()
      if (additive) {
        const totals = prepared.categories.map((_, i) =>
          prepared.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
        )
        const [top, second] = ranked(prepared.categories, totals)
        const seriesTotals = ranked(
          prepared.series.map((s) => s.name),
          prepared.series.map((s) => s.values.reduce<number>((sum, v) => sum + (v ?? 0), 0)),
        )
        if (!top) return null
        return {
          headline: `${top.name} has the highest total ${measureLower} (${fmt(top.value)})${second ? `, followed by ${second.name} (${fmt(second.value)})` : ''}.`,
          bullets: seriesTotals[0]
            ? [
                `Largest ${seriesNoun}: ${seriesTotals[0].name} (${fmt(seriesTotals[0].value)} in total).`,
              ]
            : [],
          caveats,
        }
      }
      const cells = prepared.series.flatMap((s) =>
        prepared.categories.map((x, i) => ({
          name: `${x} × ${s.name}`,
          value: s.values[i] ?? null,
        })),
      )
      const best = cells
        .filter((cell): cell is Ranked => cell.value !== null)
        .sort((a, b) => b.value - a.value)
      if (!best[0]) return null
      return {
        headline: `The highest ${measureLower} is ${best[0].name} (${fmt(best[0].value)}).`,
        bullets: best.at(-1)
          ? [`Lowest: ${best.at(-1)?.name} (${fmt(best.at(-1)?.value ?? null)}).`]
          : [],
        caveats,
      }
    }
    case 'pie': {
      const total = prepared.slices.reduce((sum, slice) => sum + slice.value, 0)
      const [top, second] = prepared.slices
      if (!top || total <= 0) return null
      const share = (value: number) =>
        formatValue(value / total, { y: 'percent', currency: null }, locale)
      return {
        headline: `${top.name} makes up ${share(top.value)} of the total${spec.format.y === 'percent' ? '' : ` ${measureLower}`}${second ? `, followed by ${second.name} (${share(second.value)})` : ''}.`,
        bullets: [`${prepared.slices.length} ${pluralize(xNoun)} in all.`],
        caveats,
      }
    }
    case 'scatter': {
      const points = prepared.series.flatMap((s) => s.points)
      const r = correlation(points)
      const x = humanizeName(spec.x ?? 'x')
      const count = `${formatNumber(points.length, locale)} points`
      if (r === null)
        return { headline: `${x} vs ${measureLower} across ${count}.`, bullets: [], caveats }
      return {
        headline: `${x} and ${measureLower} have ${strength(r)} relationship (r = ${formatNumber(Math.trunc(r * 100) / 100, locale, { maxFractionDigits: 2 })}) across ${count}.`,
        bullets: [],
        caveats,
      }
    }
    case 'bins': {
      const total = prepared.bins.reduce((sum, bin) => sum + bin.count, 0)
      const modal = [...prepared.bins].sort((a, b) => b.count - a.count)[0]
      const first = prepared.bins[0]
      const last = prepared.bins.at(-1)
      if (!modal || !first || !last || total === 0) return null
      const edge = (value: number) => formatValue(value, spec.format, locale, { compact: true })
      return {
        headline: `Most often, ${measureLower} is between ${edge(modal.start)} and ${edge(modal.end)} (${formatNumber(modal.count, locale)} of ${formatNumber(total, locale)} rows).`,
        bullets: [`Values range from ${edge(first.start)} to ${edge(last.end)}.`],
        caveats,
      }
    }
    case 'heatmap': {
      const cells = prepared.cells
        .filter((cell): cell is [number, number, number] => cell[2] !== null)
        .sort((a, b) => b[2] - a[2])
      const top = cells[0]
      const bottom = cells.at(-1)
      const name = (cell: [number, number, number]) =>
        `${prepared.xs[cell[0]] ?? ''} × ${prepared.ys[cell[1]] ?? ''}`
      if (!top || !bottom) return null
      return {
        headline: `The highest ${measureLower} is ${name(top)} (${fmt(top[2])}).`,
        bullets: [`Lowest: ${name(bottom)} (${fmt(bottom[2])}).`],
        caveats,
      }
    }
    case 'table':
      return null
    case 'combo':
    case 'waterfall':
    case 'funnel':
    case 'treemap':
    case 'boxplot':
    case 'sankey':
    case 'calendar':
      return summarizeMore(prepared, more)
  }
}
