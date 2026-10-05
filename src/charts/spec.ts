import { z } from '@/lib/zod'

// ChartSpec (docs/PRD.md §7): what to draw and why. Chosen by select.ts, tweaked by the user in
// the chart switcher and settings popover (F-VIZ-03, F-VIZ-06), drawn by toOption.ts.

export const ChartTypeSchema = z.enum([
  'kpi',
  'line',
  'area',
  'bar',
  'hbar',
  'grouped_bar',
  'stacked_bar',
  'scatter',
  'histogram',
  'donut',
  'heatmap',
  'table',
])
export type ChartType = z.infer<typeof ChartTypeSchema>

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  kpi: 'KPI',
  line: 'Line',
  area: 'Area',
  bar: 'Bar',
  hbar: 'Horizontal bar',
  grouped_bar: 'Grouped bar',
  stacked_bar: 'Stacked bar',
  scatter: 'Scatter',
  histogram: 'Histogram',
  donut: 'Donut',
  heatmap: 'Heatmap',
  table: 'Table',
}

export const ValueFormatSchema = z.enum(['number', 'percent', 'currency'])
export type ValueFormat = z.infer<typeof ValueFormatSchema>

/** Chart annotations (F-VIZ-08), for bar and line charts. */
export const AnnotationsSchema = z.object({
  /** Markers on the highest and lowest values. */
  extremes: z.boolean(),
  /** A dashed line at the average. */
  average: z.boolean(),
  /** A target line at this value, or null. */
  target: z.number().nullable(),
})
export type Annotations = z.infer<typeof AnnotationsSchema>

export const NO_ANNOTATIONS: Annotations = { extremes: false, average: false, target: null }

/** Chart types that can be annotated: they have one value axis and series of values. */
export const ANNOTATABLE: ReadonlySet<ChartType> = new Set([
  'bar',
  'hbar',
  'grouped_bar',
  'stacked_bar',
  'line',
  'area',
])

export const ChartSpecSchema = z.object({
  type: ChartTypeSchema,
  /** Category, time or x-measure column; null for KPIs and tables. */
  x: z.string().nullable(),
  /** Value columns (histogram: the measure being binned). */
  y: z.array(z.string()),
  /** Column that splits the data into series (lines, stacked/grouped bars, heatmap rows). */
  series: z.string().nullable(),
  /** Scatter: the measure that sets the point size. */
  size: z.string().nullable(),
  sort: z.enum(['asc', 'desc', 'none']),
  stacked: z.boolean(),
  logScale: z.boolean(),
  /** Value labels on bars, points and slices. */
  labels: z.boolean(),
  format: z.object({
    y: ValueFormatSchema,
    /** ISO 4217 code when format.y is 'currency'. */
    currency: z.string().nullable(),
  }),
  title: z.string(),
  /** Why this chart, in plain English (F-EXPL-03). */
  reason: z.string(),
  /** Max/min markers, average and target lines (F-VIZ-08); absent in older saved charts. */
  annotations: AnnotationsSchema.optional(),
})
export type ChartSpec = z.infer<typeof ChartSpecSchema>
