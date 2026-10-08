import { isAdditive, pairsUnique, type ResultShape } from '@/charts/classify'
import {
  baseSpec,
  CHART_POINT_LIMIT,
  count,
  fail,
  find,
  focusMeasure,
  labelColumns,
  listOf,
  MAX_BARS,
  MAX_DONUT_SLICES,
  MAX_HEATMAP_SIDE,
  MAX_KPIS,
  MAX_SERIES,
  measuresFor,
  SHARE_NAME,
  word,
  type BuildResult,
  type PreferredColumns,
  type SpecContext,
} from '@/charts/build/common'
import { formatNumber, humanizeName, pluralize } from '@/lib/format'

// The v1 chart types (F-VIZ-02): each builder fits its type to a result, or says why it can't.

/** KPIs with a trend: at most this many measures side by side. */
const MAX_TREND_KPIS = 3

export function buildKpi(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
  if (shape.rowCount === 1) {
    const y = measuresFor(shape, pref.y, MAX_KPIS)
    if (y.length === 0) return fail('a KPI needs a number column.')
    const reason =
      y.length === 1
        ? 'The answer is a single number, so it is shown as a KPI.'
        : `The answer is one row of ${y.length} numbers, shown side by side as KPIs.`
    return { ok: true, spec: baseSpec('kpi', shape, ctx, { x: null, y, reason }) }
  }
  // Values over time: the latest one, with the change since the period before and the trend
  // (F-VIZ-10).
  const time = find(shape.temporal, pref.x) ?? shape.temporal[0]
  if (!time || shape.categories.length > 0) {
    return fail(
      `a KPI needs a single row, or values over time, and this result has ${count(shape.rowCount, 'row')}.`,
    )
  }
  if (!time.unique) {
    return fail(`several rows share the same ${word(time.name)}; aggregate them first.`)
  }
  const y = measuresFor(shape, pref.y, MAX_TREND_KPIS)
  if (y.length === 0) return fail('a KPI needs a number column.')
  const reason = `Shows the latest ${listOf(y)} by ${word(time.name)}, with the change since the ${word(time.name)} before and the trend.`
  const spec = baseSpec('kpi', shape, ctx, { x: time, y, sort: 'asc', reason })
  return { ok: true, spec: { ...spec, title: ctx.title ?? humanizeName(y[0]?.name ?? 'result') } }
}

export function buildLine(
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

export function buildBar(
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

export function buildGroupedOrStacked(
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

export function buildScatter(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
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

export function buildHistogram(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
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

export function buildDonut(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
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

export function buildHeatmap(
  shape: ResultShape,
  ctx: SpecContext,
  pref: PreferredColumns,
): BuildResult {
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
