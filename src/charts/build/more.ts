import {
  isAdditive,
  pairsUnique,
  valueStyle,
  type ColumnInfo,
  type ResultShape,
} from '@/charts/classify'
import { buildGroupedOrStacked } from '@/charts/build/basic'
import {
  baseSpec,
  count,
  fail,
  find,
  focusMeasure,
  labelColumns,
  listOf,
  measuresFor,
  SHARE_NAME,
  word,
  type BuildResult,
  type PreferredColumns,
  type SpecContext,
} from '@/charts/build/common'
import { formatNumber, humanizeName, parseIsoUtc, pluralize } from '@/lib/format'

// The v2 chart types (F-VIZ-09): 100% stacked bars, bar and line, waterfall, funnel, treemap, box
// plot, sankey and calendar. Each builder fits its type to a result, or says why it can't. Pure.

export const MAX_COMBO_POINTS = 60
export const MAX_WATERFALL_STEPS = 24
export const MAX_FUNNEL_STAGES = 12
export const MAX_TREEMAP_LEAVES = 200
export const MAX_BOX_GROUPS = 30
export const MAX_SANKEY_LINKS = 50
export const MAX_CALENDAR_DAYS = 731
const MIN_CALENDAR_DAYS = 14
const DAY_MS = 86_400_000

/** "What drove the change", "bridge", "from 2024 to 2025": steps that build a total (rule 15). */
export const CHANGE_INTENT =
  /\b(changes?|changed|bridge|walk|drove|drivers?|impact|delta|variance|contribut\w*)\b|\bfrom\b.+\bto\b/i
const CHANGE_NAME = /(change|delta|diff|variance|impact|contribution|^net_|_net$)/i
export const FUNNEL_INTENT = /\b(funnel|conversions?|convert\w*|drop[- ]?offs?)\b/i
const STAGE_NAME = /(stage|step|funnel|phase)/i
export const FLOW_INTENT =
  /\b(flows?|journeys?|paths?|transitions?|migrat\w*|moved?|switch\w*)\b|\bfrom\b.+\bto\b/i
const SOURCE_NAME = /^(source|from|origin|start)(_|$)|_(source|from|origin)$/i
const TARGET_NAME = /^(target|to|destination|dest|end)(_|$)|_(target|to|destination)$/i
export const DAILY_INTENT =
  /\b(daily|each day|per day|by day|week ?days?|days? of (the )?week|calendar|weekends?|(busiest|quietest|slowest) days?)\b/i
/** "What's revenue this month?" over a series: its latest value, as a KPI with trend (rule 12). */
export const LATEST_INTENT =
  /\b(latest|current(ly)?|so far|to date|right now|today|yesterday|this (week|month|quarter|year)|last (week|month|quarter|year))\b/i
export const TREND_INTENT =
  /\b(trends?|over time|history|daily|weekly|monthly|quarterly|yearly|by (day|week|month|quarter|year)|each (day|week|month|quarter|year)|per (day|week|month|quarter|year))\b/i

/** Quartile columns a result can already have (rule 17, from precomputed statistics). */
const QUARTILES: RegExp[] = [
  /(^|_)(min|minimum|lowest|p0)(_|$)/i,
  /(^|_)(q1|p25|lower_quartile|first_quartile)(_|$)/i,
  /(^|_)(median|p50|q2)(_|$)/i,
  /(^|_)(q3|p75|upper_quartile|third_quartile)(_|$)/i,
  /(^|_)(max|maximum|highest|p100)(_|$)/i,
]

const valuesOf = (shape: ResultShape, column: ColumnInfo): (number | null)[] =>
  shape.rows.map((row) => {
    const value = row[column.index]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  })

const isColumn = (column: ColumnInfo | undefined): column is ColumnInfo => column !== undefined

const aggregateFirst = (columns: ColumnInfo[]) =>
  fail(
    `several rows share the same ${columns.map((c) => word(c.name)).join(' and ')}; aggregate them first.`,
  )

export function buildStacked100(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const built = buildGroupedOrStacked('stacked_bar', shape, ctx, pref)
  if (!built.ok) return built
  const { spec } = built
  const parts = spec.series
    ? pluralize(word(spec.series))
    : listOf(spec.y.map((name) => find(shape.measures, name)).filter(isColumn))
  const reason = `Each bar is a whole ${word(spec.x ?? '')}, split by ${parts}, so the mix compares at a glance whatever the size.`
  return { ok: true, spec: { ...spec, type: 'stacked_100', reason } }
}

export function buildCombo(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const axes = labelColumns(shape)
  const x = find(axes, pref.x) ?? shape.temporal[0] ?? axes[0]
  if (!x) return fail('a bar-and-line chart needs a category or time column along the bottom.')
  const y = measuresFor(shape, pref.y, 2)
  const [bar, line] = y
  if (!bar || !line) {
    return fail(
      'a bar-and-line chart needs two number columns: one for the bars, one for the line.',
    )
  }
  if (!shape.complete || !x.unique) return aggregateFirst([x])
  if (x.distinct > MAX_COMBO_POINTS) {
    return fail(
      `${word(x.name)} has ${x.distinct} values, and a bar-and-line chart works up to ${MAX_COMBO_POINTS}.`,
    )
  }
  const reason = `${humanizeName(bar.name)} as bars and ${word(line.name)} as a line, each on its own axis, since they're on different scales.`
  const sort = x.kind === 'temporal' ? 'asc' : x.ordinal ? 'none' : 'desc'
  const spec = baseSpec('combo', shape, ctx, { x, y, sort, reason })
  return { ok: true, spec: { ...spec, format2: valueStyle(line, shape, ctx.currency) } }
}

/** A measure of signed steps the question is about (rule 15). */
export function isChange(measure: ColumnInfo, question: string): boolean {
  return !measure.nonNegative && (CHANGE_INTENT.test(question) || CHANGE_NAME.test(measure.name))
}

export function buildWaterfall(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const labels = labelColumns(shape)
  const x = find(labels, pref.x) ?? labels[0]
  if (!x) return fail('a waterfall needs a column that names its steps.')
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a waterfall needs a number column.')
  if (!shape.complete || !x.unique) return aggregateFirst([x])
  if (x.distinct < 2 || x.distinct > MAX_WATERFALL_STEPS) {
    return fail(
      `a waterfall works for 2–${MAX_WATERFALL_STEPS} steps, and ${word(x.name)} has ${x.distinct}.`,
    )
  }
  if (!isAdditive(y))
    return fail(`${word(y.name)} doesn't add up, so its steps can't build a total.`)
  const reason = `Each ${word(x.name)} adds to or takes away from the ${word(y.name)}, step by step, ending in the total.`
  const spec = baseSpec('waterfall', shape, ctx, {
    x,
    y: [y],
    sort: x.kind === 'temporal' ? 'asc' : 'none',
    reason,
  })
  return { ok: true, spec: { ...spec, labels: true } }
}

const shrinking = (values: (number | null)[]) =>
  values.every((value, i) => value !== null && (i === 0 || value <= (values[i - 1] ?? value)))

/** Ordered stages whose numbers shrink, named or asked about as a funnel (rule 14). */
export function isFunnel(
  stage: ColumnInfo,
  measure: ColumnInfo,
  shape: ResultShape,
  question: string,
): boolean {
  return (
    (FUNNEL_INTENT.test(question) || STAGE_NAME.test(stage.name)) &&
    stage.distinct >= 3 &&
    shrinking(valuesOf(shape, measure))
  )
}

export function buildFunnel(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const x = find(shape.categories, pref.x) ?? shape.categories[0]
  if (!x) return fail('a funnel needs a column that names its stages.')
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a funnel needs a number column.')
  if (!shape.complete || !x.unique) return aggregateFirst([x])
  if (x.distinct < 2 || x.distinct > MAX_FUNNEL_STAGES) {
    return fail(
      `a funnel works for 2–${MAX_FUNNEL_STAGES} stages, and ${word(x.name)} has ${x.distinct}.`,
    )
  }
  if (!y.nonNegative) return fail(`funnel stages can't be negative, and ${word(y.name)} is.`)
  if (!shrinking(valuesOf(shape, y))) {
    return fail(`funnel stages should shrink from one to the next, and ${word(y.name)} doesn't.`)
  }
  const reason = `${humanizeName(x.name)} are stages that narrow in order; each shows its ${word(y.name)} and the share of the first stage still there.`
  return { ok: true, spec: baseSpec('funnel', shape, ctx, { x, y: [y], reason }) }
}

export function buildTreemap(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const categories = shape.categories
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a treemap needs a number column.')
  if (!y.nonNegative || (!isAdditive(y) && !SHARE_NAME.test(y.name))) {
    return fail(`tiles must add up to a whole, and ${word(y.name)} doesn't.`)
  }
  if (!shape.complete) return fail('this result has too many rows for a treemap.')
  const parent =
    pref.series === null
      ? undefined
      : (find(categories, pref.series) ??
        (pref.series === undefined && categories.length >= 2
          ? [...categories].sort((a, b) => a.distinct - b.distinct)[0]
          : undefined))
  const others = categories.filter((column) => column !== parent)
  const leaf = find(others, pref.x) ?? others[0]
  if (!leaf) return fail('a treemap needs a category column.')
  if (parent ? !pairsUnique(shape, leaf, parent) : !leaf.unique) {
    return aggregateFirst(parent ? [leaf, parent] : [leaf])
  }
  let reason = parent
    ? `Tiles sized by ${word(y.name)}: ${pluralize(word(leaf.name))} grouped within each ${word(parent.name)}.`
    : `Each ${word(leaf.name)} is a tile sized by its ${word(y.name)}, so ${count(leaf.distinct, word(leaf.name))} fit at once, biggest first.`
  if (shape.rowCount > MAX_TREEMAP_LEAVES) {
    reason += ` The ${MAX_TREEMAP_LEAVES - 1} biggest are shown; the rest are combined as Other.`
  }
  return {
    ok: true,
    spec: baseSpec('treemap', shape, ctx, {
      x: leaf,
      y: [y],
      series: parent ?? null,
      sort: 'desc',
      reason,
    }),
  }
}

/** Low, q1, median, q3 and high columns when the result already has them; else null. */
export function quartileColumns(measures: ColumnInfo[]): ColumnInfo[] | null {
  const found = QUARTILES.map((pattern) => measures.find((column) => pattern.test(column.name)))
  return found.every(isColumn) ? found : null
}

export function buildBoxplot(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const x = find(shape.categories, pref.x) ?? shape.categories[0]
  if (!x) return fail('a box plot needs a category column to group by.')
  const stats = quartileColumns(shape.measures)
  if (stats && (pref.y === undefined || pref.y.length === stats.length)) {
    if (!shape.complete || !x.unique) return aggregateFirst([x])
    if (x.distinct > MAX_BOX_GROUPS) {
      return fail(
        `a box plot works up to ${MAX_BOX_GROUPS} groups, and ${word(x.name)} has ${x.distinct}.`,
      )
    }
    const reason = `The result has the quartiles of each ${word(x.name)}, drawn as boxes: the box spans the middle half, the line is the median, the whiskers the lowest and highest.`
    return { ok: true, spec: baseSpec('boxplot', shape, ctx, { x, y: stats, reason }) }
  }
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a box plot needs a number column.')
  if (shape.complete && x.unique) {
    return fail(`a box plot needs several rows per ${word(x.name)}, and each has one.`)
  }
  if (shape.rowCount < 5) return fail('a box plot needs at least five rows.')
  let reason = `Shows how ${word(y.name)} is spread within each ${word(x.name)}: the box spans the middle half, the line is the median, and the whiskers reach the furthest values within 1.5× the box's height. Computed in the database.`
  if (x.distinct > MAX_BOX_GROUPS) {
    reason += ` The ${MAX_BOX_GROUPS} ${pluralize(word(x.name))} with the most rows are shown.`
  }
  return {
    ok: true,
    spec: baseSpec('boxplot', shape, ctx, {
      x,
      y: [y],
      sort: x.ordinal ? 'none' : 'desc',
      reason,
    }),
  }
}

/** Columns named as the two ends of a flow ("source"/"target", "from_x"/"to_x"). */
export function flowColumns(categories: ColumnInfo[]): [ColumnInfo, ColumnInfo] | null {
  const from = categories.find((column) => SOURCE_NAME.test(column.name))
  const to = categories.find((column) => TARGET_NAME.test(column.name))
  return from && to && from !== to ? [from, to] : null
}

export function buildSankey(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const categories = shape.categories
  const named = flowColumns(categories)
  const source = find(categories, pref.x) ?? named?.[0] ?? categories[0]
  const rest = categories.filter((column) => column !== source)
  const target =
    find(rest, pref.series) ?? (named && named[0] === source ? named[1] : undefined) ?? rest[0]
  if (!source || !target) {
    return fail('a sankey needs two category columns: where it flows from, and where to.')
  }
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a sankey needs a number column.')
  if (!y.nonNegative || !isAdditive(y)) {
    return fail(`flows must be amounts that add up, and ${word(y.name)} isn't.`)
  }
  if (!shape.complete || !pairsUnique(shape, source, target))
    return aggregateFirst([source, target])
  if (shape.rowCount > MAX_SANKEY_LINKS) {
    return fail(
      `a sankey works up to ${MAX_SANKEY_LINKS} flows, and this result has ${formatNumber(shape.rowCount, 'en-US')}.`,
    )
  }
  const reason = `Shows how ${word(y.name)} flows from each ${word(source.name)} to each ${word(target.name)}; the width of each band is the amount.`
  return {
    ok: true,
    spec: baseSpec('sankey', shape, ctx, { x: source, y: [y], series: target, reason }),
  }
}

/** The days a date column covers, when every value is a whole day; else null. */
export function dailySpan(shape: ResultShape, column: ColumnInfo): number | null {
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  for (const row of shape.rows) {
    const value = row[column.index]
    if (value === null || value === undefined) continue
    if (typeof value !== 'string') return null
    if (value.length > 10 && !/[T ]00:00(:00(\.0+)?)?$/.test(value)) return null
    const date = parseIsoUtc(value.slice(0, 10))
    if (!date) return null
    first = Math.min(first, date.getTime())
    last = Math.max(last, date.getTime())
  }
  return Number.isFinite(first) ? (last - first) / DAY_MS + 1 : null
}

export function buildCalendar(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const x = find(shape.temporal, pref.x) ?? shape.temporal[0]
  if (!x?.continuousTime) return fail('a calendar needs a date column.')
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a calendar needs a number column.')
  if (!shape.complete || !x.unique) {
    return fail('several rows share the same day; aggregate them by day first.')
  }
  const days = dailySpan(shape, x)
  if (days === null)
    return fail(`a calendar needs whole days, and ${word(x.name)} has times of day.`)
  if (shape.rowCount < MIN_CALENDAR_DAYS) {
    return fail(`a calendar needs at least ${MIN_CALENDAR_DAYS} days.`)
  }
  if (days > MAX_CALENDAR_DAYS) {
    return fail(
      `a calendar shows up to two years, and these days span ${formatNumber(Math.round(days), 'en-US')}.`,
    )
  }
  const reason = `Each day is a cell colored by ${word(y.name)}, laid out by week, so weekday and seasonal patterns stand out.`
  return {
    ok: true,
    spec: baseSpec('calendar', shape, ctx, { x, y: [y], sort: 'asc', reason }),
  }
}
