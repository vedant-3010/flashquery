import type { ChartHint } from '@/ai/schemas'
import {
  analyze,
  isAdditive,
  pairsUnique,
  valueStyle,
  type ColumnInfo,
  type ResultShape,
} from '@/charts/classify'
import { CHART_TYPE_LABELS, ChartTypeSchema, type ChartSpec, type ChartType } from '@/charts/spec'
import type { CellValue, ColumnMeta } from '@/engine/types'
import { formatNumber, humanizeName, pluralize } from '@/lib/format'

// Chart choice (F-VIZ-01, docs/PRD.md §6): the single source of truth. `buildSpec` makes one chart
// type fit a result (or says why it can't); `selectChart` applies the §6 rules, then uses the AI's
// hint only if that chart fits; `chartChoices` powers the chart switcher (F-VIZ-03). Pure.

/** Charts get at most this many points; bigger results are sampled or binned in SQL (F-VIZ-05). */
export const CHART_POINT_LIMIT = 5_000
export const MAX_BARS = 30
export const MAX_DONUT_SLICES = 6
export const MAX_SERIES = 8
const MAX_HEATMAP_SIDE = 50
const MAX_KPIS = 6

export interface ChartInput {
  columns: ColumnMeta[]
  /** The first rows of the result (all of them when it has ≤ CHART_POINT_LIMIT rows). */
  rows: CellValue[][]
  rowCount: number
  question?: string
  hint?: ChartHint | null
  /** Chart title; defaults to "<y> by <x>". */
  title?: string
  /** Currency for money columns (settings), or null. */
  currency?: string | null
}

interface SpecContext {
  question: string
  title: string | null
  currency: string | null
}

/** Columns to use when they fit: from the AI hint, the current chart, or the settings popover. */
export interface PreferredColumns {
  x?: string | null
  y?: string[]
  series?: string | null
  size?: string | null
}

export type BuildResult = { ok: true; spec: ChartSpec } | { ok: false; reason: string }

const DONUT_INTENT =
  /\b(share|shares|proportion|percentage|percent|breakdown|composition|split|mix|makes? up|contribut\w*)\b/i
const SHARE_NAME = /(share|proportion|pct_of|percent_of)/i
const CUMULATIVE_NAME = /(cumulative|running|cum_|ytd|to_date)/i

const word = (name: string) => humanizeName(name).toLowerCase()
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const count = (n: number, noun: string) =>
  `${formatNumber(n, 'en-US')} ${n === 1 ? noun : pluralize(noun)}`
const listOf = (columns: ColumnInfo[]) => {
  const words = columns.map((column) => word(column.name))
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

function fail(reason: string): BuildResult {
  return { ok: false, reason }
}

function find(columns: ColumnInfo[], name: string | null | undefined): ColumnInfo | undefined {
  return name ? columns.find((column) => column.name === name) : undefined
}

/** The measure the question is about ("profit margin" → profit_margin); else the last one. */
export function focusMeasure(measures: ColumnInfo[], question: string): ColumnInfo | undefined {
  const asked = question.toLowerCase()
  let best: { column: ColumnInfo; score: number } | undefined
  for (const column of measures) {
    const words = word(column.name)
      .split(' ')
      .filter((w) => w.length > 2 && !['total', 'sum', 'avg', 'count'].includes(w))
    const score = words.filter((w) => asked.includes(w.replace(/s$/, ''))).length
    if (score > 0 && (!best || score >= best.score)) best = { column, score }
  }
  return best?.column ?? measures.at(-1)
}

function measuresFor(
  shape: ResultShape,
  preferred: string[] | undefined,
  max: number,
): ColumnInfo[] {
  const chosen = (preferred ?? [])
    .map((name) => find(shape.measures, name))
    .filter((column): column is ColumnInfo => column !== undefined)
  return (chosen.length > 0 ? chosen : shape.measures).slice(0, max)
}

function baseSpec(
  type: ChartType,
  shape: ResultShape,
  ctx: SpecContext,
  parts: {
    x: ColumnInfo | null
    y: ColumnInfo[]
    series?: ColumnInfo | null
    size?: ColumnInfo | null
    sort?: ChartSpec['sort']
    stacked?: boolean
    reason: string
  },
): ChartSpec {
  const y = parts.y
  const title =
    ctx.title ??
    (parts.x && y[0]
      ? `${humanizeName(y[0].name)} by ${word(parts.x.name)}`
      : humanizeName(y[0]?.name ?? 'result'))
  return {
    type,
    x: parts.x?.name ?? null,
    y: y.map((column) => column.name),
    series: parts.series?.name ?? null,
    size: parts.size?.name ?? null,
    sort: parts.sort ?? 'none',
    stacked: parts.stacked ?? false,
    logScale: false,
    labels: false,
    format: valueStyle(y[0], shape, ctx.currency),
    title,
    reason: parts.reason,
  }
}

const labelColumns = (shape: ResultShape) => [...shape.categories, ...shape.temporal]

function buildKpi(shape: ResultShape, ctx: SpecContext, pref: PreferredColumns): BuildResult {
  if (shape.rowCount !== 1) {
    return fail(`a KPI needs a single row, and this result has ${count(shape.rowCount, 'row')}.`)
  }
  const y = measuresFor(shape, pref.y, MAX_KPIS)
  if (y.length === 0) return fail('a KPI needs a number column.')
  const reason =
    y.length === 1
      ? 'The answer is a single number, so it is shown as a KPI.'
      : `The answer is one row of ${y.length} numbers, shown side by side as KPIs.`
  return { ok: true, spec: baseSpec('kpi', shape, ctx, { x: null, y, reason }) }
}

function buildLine(
  type: 'line' | 'area',
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  if (shape.rowCount < 2) return fail('a line needs at least two points.')
  const axes = [...shape.temporal, ...shape.categories.filter((column) => column.ordinal)]
  const x = find(axes, pref.x) ?? axes[0]
  if (!x) return fail('a line needs a time column (or an ordered one) along the x axis.')
  const series =
    find(shape.categories, pref.series) ??
    (pref.series === undefined
      ? shape.categories.find((column) => column !== x && !column.ordinal)
      : undefined)
  const seriesColumn = series && series !== x ? series : null
  const y = measuresFor(shape, pref.y, seriesColumn ? 1 : 5)
  if (y.length === 0) return fail('a line needs a number column.')
  const unique = seriesColumn ? pairsUnique(shape, x, seriesColumn) : x.unique
  if (!unique) {
    return fail(`several rows share the same ${word(x.name)}; aggregate them first.`)
  }
  const along = x.kind === 'temporal' ? 'a time column' : 'in a natural order'
  let reason = seriesColumn
    ? `One line per ${word(seriesColumn.name)} (${count(seriesColumn.distinct, word(seriesColumn.name))}) across ${word(x.name)}.`
    : `${humanizeName(x.name)} is ${along}, so ${listOf(y)} ${y.length === 1 ? 'is' : 'are'} drawn as ${y.length === 1 ? 'a line' : 'lines'} across it.`
  if (seriesColumn && seriesColumn.distinct > MAX_SERIES) {
    reason += ` The top ${MAX_SERIES - 1} are shown; the rest are combined as Other.`
  }
  if (!shape.complete) {
    reason += ` Every n-th of the ${formatNumber(shape.rowCount, 'en-US')} points is drawn.`
  }
  const stacked = type === 'area' && seriesColumn !== null && y.every(isAdditive)
  return {
    ok: true,
    spec: baseSpec(type, shape, ctx, {
      x,
      y,
      series: seriesColumn,
      sort: x.kind === 'temporal' ? 'asc' : 'none',
      stacked,
      reason,
    }),
  }
}

function buildBar(
  type: 'bar' | 'hbar',
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const labels = labelColumns(shape)
  const x = find(labels, pref.x) ?? labels[0]
  if (!x) return fail('a bar chart needs a category column.')
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a bar chart needs a number column.')
  if (!shape.complete || !x.unique) {
    return fail(`several rows share the same ${word(x.name)}; aggregate them first.`)
  }
  if (x.distinct > MAX_BARS) {
    return fail(`${word(x.name)} has ${x.distinct} values, and bars work up to ${MAX_BARS}.`)
  }
  const sort = x.ordinal ? 'none' : 'desc'
  let reason = `Compares ${word(y.name)} across ${count(x.distinct, word(x.name))}${sort === 'desc' ? ', highest first' : ''}.`
  if (type === 'hbar') reason += ' Bars run sideways so long or many labels stay readable.'
  return { ok: true, spec: baseSpec(type, shape, ctx, { x, y: [y], sort, reason }) }
}

function buildGroupedOrStacked(
  type: 'grouped_bar' | 'stacked_bar',
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  const labels = labelColumns(shape)
  const x = find(labels, pref.x) ?? labels[0]
  if (!x) return fail('this chart needs a category column.')
  if (!shape.complete) return fail('this result has too many rows for bars.')
  const bySeries =
    pref.series !== null &&
    labels.some((column) => column !== x) &&
    (pref.series !== undefined || pref.y === undefined || pref.y.length <= 1)
  const stacked = type === 'stacked_bar'

  if (bySeries) {
    const series =
      find(labels, pref.series) ??
      labels.filter((column) => column !== x).sort((a, b) => a.distinct - b.distinct)[0]
    const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
    if (!series || series === x || !y) return fail('this chart needs two category columns.')
    if (!pairsUnique(shape, x, series)) {
      return fail(`several rows share the same ${word(x.name)} and ${word(series.name)}.`)
    }
    if (x.distinct > MAX_BARS) {
      return fail(`${word(x.name)} has ${x.distinct} values, and bars work up to ${MAX_BARS}.`)
    }
    if (stacked && (!isAdditive(y) || !y.nonNegative)) {
      return fail(`${word(y.name)} doesn't add up across ${pluralize(word(series.name))}.`)
    }
    let reason = stacked
      ? `Stacks ${word(y.name)} by ${word(series.name)} within each ${word(x.name)}, so bar heights show the totals.`
      : `One bar per ${word(series.name)} within each ${word(x.name)}, to compare ${word(y.name)}.`
    if (series.distinct > MAX_SERIES) {
      reason += ` The top ${MAX_SERIES - 1} ${pluralize(word(series.name))} are shown; the rest are combined as Other.`
    }
    return {
      ok: true,
      spec: baseSpec(type, shape, ctx, {
        x,
        y: [y],
        series,
        sort: x.ordinal ? 'none' : 'desc',
        stacked,
        reason,
      }),
    }
  }

  const y = measuresFor(shape, pref.y, 4)
  if (y.length < 2) return fail('this chart needs two to four number columns (or a series).')
  if (!x.unique) return fail(`several rows share the same ${word(x.name)}; aggregate them first.`)
  if (x.distinct > MAX_BARS) {
    return fail(`${word(x.name)} has ${x.distinct} values, and bars work up to ${MAX_BARS}.`)
  }
  if (stacked && !y.every((column) => isAdditive(column) && column.nonNegative)) {
    return fail(`${listOf(y)} don't add up to a meaningful total.`)
  }
  const reason = stacked
    ? `Stacks ${listOf(y)} within each ${word(x.name)}, so bar heights show the totals.`
    : `Puts ${listOf(y)} side by side for each ${word(x.name)}.`
  return { ok: true, spec: baseSpec(type, shape, ctx, { x, y, stacked, reason }) }
}

function buildScatter(shape: ResultShape, ctx: SpecContext, pref: PreferredColumns): BuildResult {
  const x = find(shape.measures, pref.x) ?? shape.measures[0]
  const y =
    find(
      shape.measures.filter((column) => column !== x),
      pref.y?.[0],
    ) ?? shape.measures.find((column) => column !== x)
  if (!x || !y) return fail('a scatter plot needs two number columns.')
  if (shape.rowCount < 3) return fail('a scatter plot needs at least three points.')
  const others = shape.measures.filter((column) => column !== x && column !== y)
  const size = pref.size === null ? undefined : (find(others, pref.size) ?? others[0])
  const series =
    pref.series === null
      ? undefined
      : (find(shape.categories, pref.series) ??
        shape.categories.find((column) => column.distinct <= MAX_SERIES))
  let reason = `Each row is a point: ${word(x.name)} across, ${word(y.name)} up`
  if (size) reason += `; ${word(size.name)} sets the size`
  if (series) reason += `; colored by ${word(series.name)}`
  reason += '.'
  if (shape.rowCount > CHART_POINT_LIMIT) {
    reason += ` A random sample of ${formatNumber(CHART_POINT_LIMIT, 'en-US')} of the ${formatNumber(shape.rowCount, 'en-US')} points is shown.`
  }
  return {
    ok: true,
    spec: baseSpec('scatter', shape, ctx, {
      x,
      y: [y],
      size: size ?? null,
      series: series ?? null,
      reason,
    }),
  }
}

function buildHistogram(shape: ResultShape, ctx: SpecContext, pref: PreferredColumns): BuildResult {
  const measure =
    find(shape.measures, pref.y?.[0]) ?? find(shape.measures, pref.x) ?? shape.measures[0]
  if (!measure) return fail('a histogram needs a number column.')
  if (shape.rowCount < 2) return fail('a histogram needs at least two rows.')
  const reason = `Shows how ${word(measure.name)} is spread across ${count(shape.rowCount, 'row')}; the bins are counted in the database.`
  return {
    ok: true,
    spec: {
      ...baseSpec('histogram', shape, ctx, { x: measure, y: [measure], reason }),
      title: ctx.title ?? `Distribution of ${word(measure.name)}`,
    },
  }
}

function buildDonut(shape: ResultShape, ctx: SpecContext, pref: PreferredColumns): BuildResult {
  const x = find(shape.categories, pref.x) ?? shape.categories[0]
  if (!x) return fail('a donut needs a category column.')
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!y) return fail('a donut needs a number column.')
  if (!shape.complete || !x.unique) {
    return fail(`several rows share the same ${word(x.name)}; aggregate them first.`)
  }
  if (x.distinct < 2 || x.distinct > MAX_DONUT_SLICES) {
    return fail(
      `a donut works for 2–${MAX_DONUT_SLICES} slices, and ${word(x.name)} has ${x.distinct}.`,
    )
  }
  if (!y.nonNegative || (!isAdditive(y) && !SHARE_NAME.test(y.name))) {
    return fail(`slices must add up to a whole, and ${word(y.name)} doesn't.`)
  }
  const of = SHARE_NAME.test(y.name) ? 'the total' : `the total ${word(y.name)}`
  const reason = `Shows each ${word(x.name)}'s share of ${of} (${count(x.distinct, 'slice')}).`
  return { ok: true, spec: baseSpec('donut', shape, ctx, { x, y: [y], sort: 'desc', reason }) }
}

function buildHeatmap(shape: ResultShape, ctx: SpecContext, pref: PreferredColumns): BuildResult {
  const labels = labelColumns(shape)
  const x = find(labels, pref.x) ?? [...labels].sort((a, b) => b.distinct - a.distinct)[0]
  const series = find(labels, pref.series) ?? labels.find((column) => column !== x)
  const y = find(shape.measures, pref.y?.[0]) ?? focusMeasure(shape.measures, ctx.question)
  if (!x || !series || series === x || !y) {
    return fail('a heatmap needs two category columns and a number column.')
  }
  if (!shape.complete || !pairsUnique(shape, x, series)) {
    return fail(`several rows share the same ${word(x.name)} and ${word(series.name)}.`)
  }
  if (x.distinct > MAX_HEATMAP_SIDE || series.distinct > MAX_HEATMAP_SIDE) {
    return fail(`a heatmap works up to ${MAX_HEATMAP_SIDE} values on each side.`)
  }
  const reason = `Shows every ${word(x.name)} × ${word(series.name)} combination as a cell, from dark (low) to bright (high) ${word(y.name)}.`
  return { ok: true, spec: baseSpec('heatmap', shape, ctx, { x, y: [y], series, reason }) }
}

function tableSpec(shape: ResultShape, ctx: SpecContext, reason: string): ChartSpec {
  return baseSpec('table', shape, ctx, { x: null, y: [], reason })
}

function context(input: ChartInput): SpecContext {
  return {
    question: input.question ?? '',
    title: input.title ?? null,
    currency: input.currency ?? null,
  }
}

/** Makes one chart type fit the result, keeping preferred columns where they fit. */
export function buildSpec(
  type: ChartType,
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns = {},
): BuildResult {
  switch (type) {
    case 'kpi':
      return buildKpi(shape, ctx, pref)
    case 'line':
    case 'area':
      return buildLine(type, shape, ctx, pref)
    case 'bar':
    case 'hbar':
      return buildBar(type, shape, ctx, pref)
    case 'grouped_bar':
    case 'stacked_bar':
      return buildGroupedOrStacked(type, shape, ctx, pref)
    case 'scatter':
      return buildScatter(shape, ctx, pref)
    case 'histogram':
      return buildHistogram(shape, ctx, pref)
    case 'donut':
      return buildDonut(shape, ctx, pref)
    case 'heatmap':
      return buildHeatmap(shape, ctx, pref)
    case 'table':
      return { ok: true, spec: tableSpec(shape, ctx, 'Shows the result as a table.') }
  }
}

function orTable(result: BuildResult, shape: ResultShape, ctx: SpecContext): ChartSpec {
  return result.ok
    ? result.spec
    : tableSpec(shape, ctx, `No chart fits: ${result.reason} A table shows every row.`)
}

/** Bar or horizontal bar for one category and one measure (rule 5). */
function bars(shape: ResultShape, ctx: SpecContext, x: ColumnInfo, y: ColumnInfo): BuildResult {
  const horizontal = x.distinct > 10 || x.maxLength > 14
  return buildBar(horizontal ? 'hbar' : 'bar', shape, ctx, { x: x.name, y: [y.name] })
}

/** The §6 rules, first match wins. Always returns a spec (a table when nothing fits). */
function ruleSpec(shape: ResultShape, ctx: SpecContext): ChartSpec {
  const { rowCount } = shape
  const { temporal: T, measures: M, categories: C, text } = shape
  if (rowCount === 0) return tableSpec(shape, ctx, 'The query returned no rows.')
  const [prose] = text
  if (prose) {
    return tableSpec(
      shape,
      ctx,
      `${humanizeName(prose.name)} holds long text, which reads best in a table.`,
    )
  }
  if (M.length === 0) return tableSpec(shape, ctx, 'There is no number column to plot.')

  // 1–2: one row → KPI(s).
  if (rowCount === 1) {
    return M.length <= MAX_KPIS
      ? orTable(buildKpi(shape, ctx, {}), shape, ctx)
      : tableSpec(shape, ctx, `One row with ${M.length} numbers reads best as a table.`)
  }
  // 3: time + measures → line (area for a single cumulative measure).
  const [time] = T
  if (time && T.length === 1 && C.length === 0 && M.length <= 5) {
    const area = M.length === 1 && M[0] !== undefined && CUMULATIVE_NAME.test(M[0].name)
    return orTable(buildLine(area ? 'area' : 'line', shape, ctx, { series: null }), shape, ctx)
  }
  // 4: time + category + measure → one line per category.
  const [category] = C
  if (time && category && T.length === 1 && C.length === 1 && M.length === 1) {
    return orTable(
      buildLine('line', shape, ctx, { x: time.name, series: category.name }),
      shape,
      ctx,
    )
  }
  if (T.length === 0 && category && C.length === 1) {
    if (category.unique && shape.complete) {
      if (category.distinct > MAX_BARS) {
        return tableSpec(
          shape,
          ctx,
          `${humanizeName(category.name)} has ${category.distinct} values; more than ${MAX_BARS} categories read best in a table.`,
        )
      }
      const focus = focusMeasure(M, ctx.question)
      // 10: a share of a whole across a few categories → donut; 5: otherwise bars.
      if (focus && (M.length === 1 || !comparable(M))) {
        const share = DONUT_INTENT.test(ctx.question) || SHARE_NAME.test(focus.name)
        const donut = share ? buildDonut(shape, ctx, { x: category.name, y: [focus.name] }) : null
        if (donut?.ok) return donut.spec
      }
      if (M.length === 1 && focus) return orTable(bars(shape, ctx, category, focus), shape, ctx)
      // 6: several measures → grouped bars, if they share a scale; else bars of the one asked about.
      if (M.length <= 4 && comparable(M)) {
        return orTable(
          buildGroupedOrStacked('grouped_bar', shape, ctx, { x: category.name, series: null }),
          shape,
          ctx,
        )
      }
      if (focus) {
        const result = bars(shape, ctx, category, focus)
        if (result.ok) {
          const rest = M.length - 1
          result.spec.reason += ` The other ${count(rest, 'number')} ${rest === 1 ? 'is' : 'are'} on ${rest === 1 ? 'a different scale' : 'different scales'}; see the table.`
        }
        return orTable(result, shape, ctx)
      }
    }
    // 8: repeated categories with 2–3 measures → scatter, colored by category.
    if (M.length >= 2 && M.length <= 3) return orTable(buildScatter(shape, ctx, {}), shape, ctx)
    return tableSpec(
      shape,
      ctx,
      `Several rows share each ${word(category.name)}, so there's nothing to compare side by side; a table shows every row.`,
    )
  }
  // 7: two categories + a measure → stacked bars (heatmap when both have many values).
  if (T.length === 0 && C.length === 2 && M.length === 1) {
    const [a, b] = [...C].sort((p, q) => q.distinct - p.distinct)
    if (a && b) {
      if (a.distinct > 6 && b.distinct > 6) {
        const heat = buildHeatmap(shape, ctx, { x: a.name, series: b.name })
        if (heat.ok) return heat.spec
      }
      const [measure] = M
      const additive = measure !== undefined && isAdditive(measure) && measure.nonNegative
      const type = additive && b.distinct <= MAX_SERIES ? 'stacked_bar' : 'grouped_bar'
      return orTable(
        buildGroupedOrStacked(type, shape, ctx, { x: a.name, series: b.name }),
        shape,
        ctx,
      )
    }
  }
  // 8: two or three measures → scatter (third = point size).
  if (T.length === 0 && C.length === 0 && M.length >= 2 && M.length <= 3) {
    return orTable(buildScatter(shape, ctx, {}), shape, ctx)
  }
  // 9: one measure over many rows → histogram.
  if (T.length === 0 && C.length === 0 && M.length === 1 && rowCount >= 20) {
    return orTable(buildHistogram(shape, ctx, {}), shape, ctx)
  }
  // 11: anything else.
  return tableSpec(
    shape,
    ctx,
    `No chart fits a result with ${describeShape(shape)}; a table shows every row.`,
  )
}

/** Measures on similar scales can share an axis (largest ≤ 20× smallest). */
function comparable(measures: ColumnInfo[]): boolean {
  const sizes = measures.map((column) => column.magnitude).filter((size) => size > 0)
  if (sizes.length < 2) return true
  return Math.max(...sizes) / Math.min(...sizes) <= 20
}

function describeShape(shape: ResultShape): string {
  const parts = [
    shape.temporal.length > 0 && count(shape.temporal.length, 'time column'),
    shape.categories.length > 0 && count(shape.categories.length, 'category column'),
    shape.measures.length > 0 && count(shape.measures.length, 'number column'),
  ].filter(Boolean)
  return parts.join(', ')
}

/** Picks the chart for a result (F-VIZ-01); the AI hint wins only when its chart fits. */
export function selectChart(input: ChartInput): ChartSpec {
  const shape = analyze(input.columns, input.rows, input.rowCount)
  return selectFor(shape, input)
}

export function selectFor(
  shape: ResultShape,
  input: Omit<ChartInput, 'columns' | 'rows' | 'rowCount'>,
): ChartSpec {
  const ctx = context({ columns: [], rows: [], rowCount: 0, ...input })
  const auto = ruleSpec(shape, ctx)
  const hint = input.hint
  if (!hint?.type) return auto
  const label =
    hint.type === 'kpi'
      ? 'KPI'
      : hint.type === 'table'
        ? 'table'
        : `${CHART_TYPE_LABELS[hint.type].toLowerCase()} chart`
  const suggested = buildSpec(hint.type, shape, ctx, {
    x: hint.x,
    y: hint.y.length > 0 ? hint.y : undefined,
    series: hint.series ?? undefined,
  })
  if (suggested.ok) {
    if (hint.type === 'table') {
      return tableSpec(shape, ctx, 'The AI suggested a table for this result.')
    }
    return {
      ...suggested.spec,
      reason: `The AI suggested a ${label}, and it fits: ${lowerFirst(suggested.spec.reason)}`,
    }
  }
  return {
    ...auto,
    reason: `${auto.reason} (The AI suggested a ${label}, but ${suggested.reason})`,
  }
}

export interface ChartChoice {
  type: ChartType
  spec: ChartSpec | null
  /** Why this type doesn't fit (null when it does). */
  reason: string | null
}

/** Every chart type for the switcher: the spec it would draw, or why it can't (F-VIZ-03). */
export function chartChoices(
  shape: ResultShape,
  current: ChartSpec,
  input: Omit<ChartInput, 'columns' | 'rows' | 'rowCount'> = {},
): ChartChoice[] {
  const ctx = context({ columns: [], rows: [], rowCount: 0, ...input })
  const pref: PreferredColumns = {
    x: current.x ?? undefined,
    y: current.y.length > 0 ? current.y : undefined,
    series: current.series ?? undefined,
    size: current.size ?? undefined,
  }
  return ChartTypeSchema.options.map((type) => {
    if (type === current.type) return { type, spec: current, reason: null }
    const built = buildSpec(type, shape, ctx, pref)
    if (!built.ok) {
      const reason = built.reason
      return { type, spec: null, reason: reason.charAt(0).toUpperCase() + reason.slice(1) }
    }
    return { type, spec: { ...built.spec, format: current.format }, reason: null }
  })
}

/** Re-fits the current chart type to new columns from the settings popover (F-VIZ-06). */
export function respec(
  shape: ResultShape,
  current: ChartSpec,
  pref: PreferredColumns,
  input: Omit<ChartInput, 'columns' | 'rows' | 'rowCount'> = {},
): BuildResult {
  const ctx = context({ columns: [], rows: [], rowCount: 0, ...input })
  const built = buildSpec(current.type, shape, ctx, pref)
  if (!built.ok) return built
  return {
    ok: true,
    spec: {
      ...built.spec,
      sort: current.sort,
      logScale: current.logScale,
      labels: current.labels,
      stacked: built.spec.type === 'area' ? current.stacked : built.spec.stacked,
    },
  }
}

export interface FieldOptions {
  x: ColumnInfo[]
  y: ColumnInfo[]
  /** Several y columns can be picked (else one). */
  multiY: boolean
  series: ColumnInfo[]
  size: ColumnInfo[]
}

/** Which columns the settings popover offers for each field of a chart type (F-VIZ-06). */
export function fieldOptions(type: ChartType, shape: ResultShape): FieldOptions {
  const labels = labelColumns(shape)
  const none: ColumnInfo[] = []
  const M = shape.measures
  switch (type) {
    case 'kpi':
      return { x: none, y: M, multiY: true, series: none, size: none }
    case 'line':
    case 'area':
      return {
        x: [...shape.temporal, ...shape.categories.filter((column) => column.ordinal)],
        y: M,
        multiY: true,
        series: shape.categories,
        size: none,
      }
    case 'bar':
    case 'hbar':
    case 'donut':
      return {
        x: type === 'donut' ? shape.categories : labels,
        y: M,
        multiY: false,
        series: none,
        size: none,
      }
    case 'grouped_bar':
    case 'stacked_bar':
      return { x: labels, y: M, multiY: true, series: labels, size: none }
    case 'scatter':
      return {
        x: M,
        y: M,
        multiY: false,
        series: shape.categories.filter((column) => column.distinct <= MAX_SERIES),
        size: M,
      }
    case 'histogram':
      return { x: none, y: M, multiY: false, series: none, size: none }
    case 'heatmap':
      return { x: labels, y: M, multiY: false, series: labels, size: none }
    case 'table':
      return { x: none, y: none, multiY: false, series: none, size: none }
  }
}
