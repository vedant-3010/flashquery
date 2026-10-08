import {
  analyze,
  isAdditive,
  valueStyle,
  type ColumnInfo,
  type ResultShape,
} from '@/charts/classify'
import {
  buildBar,
  buildDonut,
  buildGroupedOrStacked,
  buildHeatmap,
  buildHistogram,
  buildKpi,
  buildLine,
  buildScatter,
} from '@/charts/build/basic'
import {
  buildBoxplot,
  buildCalendar,
  buildCombo,
  buildFunnel,
  buildSankey,
  buildStacked100,
  buildTreemap,
  buildWaterfall,
  DAILY_INTENT,
  flowColumns,
  FLOW_INTENT,
  isChange,
  isFunnel,
  LATEST_INTENT,
  quartileColumns,
  TREND_INTENT,
} from '@/charts/build/more'
import {
  count,
  CUMULATIVE_NAME,
  DONUT_INTENT,
  lowerFirst,
  MAX_BARS,
  MAX_DONUT_SLICES,
  MAX_KPIS,
  MAX_SERIES,
  SHARE_NAME,
  tableSpec,
  word,
  askedMeasure,
  focusMeasure,
  labelColumns,
  type BuildResult,
  type ChartInput,
  type PreferredColumns,
  type SpecContext,
} from '@/charts/build/common'
import { CHART_TYPE_LABELS, ChartTypeSchema, type ChartSpec, type ChartType } from '@/charts/spec'
import { humanizeName } from '@/lib/format'

// Chart choice (F-VIZ-01, docs/PRD.md §6): the single source of truth. `buildSpec` makes one chart
// type fit a result (or says why it can't); `selectChart` applies the §6 rules, then uses the AI's
// hint only if that chart fits; `chartChoices` powers the chart switcher (F-VIZ-03). Pure. The
// builders live in src/charts/build/.

export {
  CHART_POINT_LIMIT,
  focusMeasure,
  MAX_BARS,
  MAX_DONUT_SLICES,
  MAX_SERIES,
  type BuildResult,
  type ChartInput,
  type PreferredColumns,
} from '@/charts/build/common'

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
    case 'stacked_100':
      return buildStacked100(shape, ctx, pref)
    case 'combo':
      return buildCombo(shape, ctx, pref)
    case 'waterfall':
      return buildWaterfall(shape, ctx, pref)
    case 'funnel':
      return buildFunnel(shape, ctx, pref)
    case 'treemap':
      return buildTreemap(shape, ctx, pref)
    case 'boxplot':
      return buildBoxplot(shape, ctx, pref)
    case 'sankey':
      return buildSankey(shape, ctx, pref)
    case 'calendar':
      return buildCalendar(shape, ctx, pref)
  }
}

const fail = (): BuildResult => ({ ok: false, reason: '' })

/** The first of these that fits, else null. */
function firstFit(...results: (() => BuildResult)[]): ChartSpec | null {
  for (const result of results) {
    const built = result()
    if (built.ok) return built.spec
  }
  return null
}

/** Two measures that can't share an axis: very different sizes, or different units. */
function differentScales(shape: ResultShape, ctx: SpecContext, measures: ColumnInfo[]): boolean {
  const styles = measures.map((column) => valueStyle(column, shape, ctx.currency).y)
  return !comparable(measures) || new Set(styles).size > 1
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
  const q = ctx.question
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
  const [time] = T
  const [first] = M
  if (time && T.length === 1 && C.length === 0 && M.length <= 5) {
    const fit = firstFit(
      // 12: "what's revenue this month?" over a series → the latest value as a KPI, with its trend.
      () =>
        M.length <= 3 && LATEST_INTENT.test(q) && !TREND_INTENT.test(q)
          ? buildKpi(shape, ctx, { x: time.name })
          : fail(),
      // 19: daily values and a question about days → a calendar.
      () =>
        M.length === 1 && DAILY_INTENT.test(q)
          ? buildCalendar(shape, ctx, { x: time.name })
          : fail(),
      // 15: signed changes and a question about what drove them → a waterfall.
      () =>
        M.length === 1 && first && isChange(first, q)
          ? buildWaterfall(shape, ctx, { x: time.name })
          : fail(),
      // 13: two measures on different scales, neither singled out → bars and a line.
      () =>
        M.length === 2 && differentScales(shape, ctx, M) && !askedMeasure(M, q)
          ? buildCombo(shape, ctx, { x: time.name })
          : fail(),
    )
    if (fit) return fit
    // 3: time + measures → line (area for a single cumulative measure).
    const area = M.length === 1 && first !== undefined && CUMULATIVE_NAME.test(first.name)
    return orTable(buildLine(area ? 'area' : 'line', shape, ctx, { series: null }), shape, ctx)
  }
  // 4: time + category + measure → one line per category (20: shares of a mix → 100% stacked).
  const [category] = C
  if (time && category && T.length === 1 && C.length === 1 && M.length === 1) {
    const mix = DONUT_INTENT.test(q)
      ? buildStacked100(shape, ctx, { x: time.name, series: category.name })
      : null
    if (mix?.ok) return mix.spec
    return orTable(
      buildLine('line', shape, ctx, { x: time.name, series: category.name }),
      shape,
      ctx,
    )
  }
  if (T.length === 0 && category && C.length === 1) {
    if (category.unique && shape.complete) {
      // 17: quartile columns per group → box plots.
      const stats = quartileColumns(M)
      if (stats) {
        const box = buildBoxplot(shape, ctx, { x: category.name })
        if (box.ok) return box.spec
      }
      const focus = focusMeasure(M, q)
      if (category.distinct > MAX_BARS) {
        // 16: more categories than bars hold, adding up to a whole → treemap.
        const tiles = focus
          ? buildTreemap(shape, ctx, { x: category.name, y: [focus.name], series: null })
          : null
        if (tiles?.ok) return tiles.spec
        return tableSpec(
          shape,
          ctx,
          `${humanizeName(category.name)} has ${category.distinct} values; more than ${MAX_BARS} categories read best in a table.`,
        )
      }
      if (focus && (M.length === 1 || !comparable(M))) {
        const single = M.length === 1
        const share = DONUT_INTENT.test(q) || SHARE_NAME.test(focus.name)
        const fit = firstFit(
          // 14: ordered stages that shrink → funnel.
          () =>
            single && isFunnel(category, focus, shape, q)
              ? buildFunnel(shape, ctx, { x: category.name, y: [focus.name] })
              : fail(),
          // 15: signed contributions → waterfall.
          () =>
            single && isChange(focus, q)
              ? buildWaterfall(shape, ctx, { x: category.name, y: [focus.name] })
              : fail(),
          // 10: a share of a whole across a few categories → donut; 16: across more → treemap.
          () => (share ? buildDonut(shape, ctx, { x: category.name, y: [focus.name] }) : fail()),
          () =>
            share && category.distinct > MAX_DONUT_SLICES
              ? buildTreemap(shape, ctx, { x: category.name, y: [focus.name], series: null })
              : fail(),
        )
        if (fit) return fit
      }
      // 5: one measure → bars.
      if (M.length === 1 && focus) return orTable(bars(shape, ctx, category, focus), shape, ctx)
      // 13: two measures on different scales, neither singled out → bars and a line, each with
      // its own axis. (A question about one of them gets bars of that one, below.)
      if (M.length === 2 && differentScales(shape, ctx, M) && !askedMeasure(M, q)) {
        const combo = buildCombo(shape, ctx, { x: category.name })
        if (combo.ok) return combo.spec
      }
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
    // 17: several rows per category and one measure → a box plot of each category's spread.
    if (M.length === 1 && first) {
      const box = buildBoxplot(shape, ctx, { x: category.name, y: [first.name] })
      if (box.ok) return box.spec
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
    const [a, b] = [...C].sort((p, q2) => q2.distinct - p.distinct)
    if (a && b) {
      const fit = firstFit(
        // 18: amounts flowing from one to the other → sankey.
        () => (FLOW_INTENT.test(q) || flowColumns(C) ? buildSankey(shape, ctx, {}) : fail()),
        // 20: shares of a mix → 100% stacked bars; 16: with many parts → a two-level treemap.
        () =>
          DONUT_INTENT.test(q) && b.distinct <= MAX_SERIES
            ? buildStacked100(shape, ctx, { x: a.name, series: b.name })
            : fail(),
        () =>
          DONUT_INTENT.test(q) ? buildTreemap(shape, ctx, { x: a.name, series: b.name }) : fail(),
        () =>
          a.distinct > 6 && b.distinct > 6
            ? buildHeatmap(shape, ctx, { x: a.name, series: b.name })
            : fail(),
      )
      if (fit) return fit
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
    case 'stacked_100':
      return { x: labels, y: M, multiY: true, series: labels, size: none }
    case 'combo':
      return { x: labels, y: M, multiY: true, series: none, size: none }
    case 'waterfall':
      return { x: labels, y: M, multiY: false, series: none, size: none }
    case 'funnel':
    case 'boxplot':
      return { x: shape.categories, y: M, multiY: false, series: none, size: none }
    case 'treemap':
    case 'sankey':
      return { x: shape.categories, y: M, multiY: false, series: shape.categories, size: none }
    case 'calendar':
      return { x: shape.temporal, y: M, multiY: false, series: none, size: none }
  }
}
