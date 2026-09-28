import { z } from 'zod'

// ChartSpec (docs/PRD.md §7). Selection (select.ts) and rendering (toOption.ts, <EChart>) arrive in
// M4; the AI plan already carries a chart hint in this shape.

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

export const ChartSpecSchema = z.object({
  type: ChartTypeSchema,
  x: z.string().nullable(),
  y: z.array(z.string()),
  series: z.string().nullable(),
  size: z.string().nullable(),
  sort: z.enum(['asc', 'desc', 'none']),
  stacked: z.boolean(),
  format: z.object({
    y: z.enum(['number', 'percent', 'currency']),
    currency: z.string().nullable(),
  }),
  title: z.string(),
  /** Why this chart, in plain English (F-EXPL-03). */
  reason: z.string(),
})
export type ChartSpec = z.infer<typeof ChartSpecSchema>
