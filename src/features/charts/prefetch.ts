/**
 * Starts downloading the chart panel (and ECharts, ~220 KB gzip) while a question or query runs,
 * so the first chart doesn't wait for it. A failure here is ignored: rendering the chart imports
 * the same module again and shows its error.
 */
export function prefetchCharts(): void {
  import('@/features/charts/ChartPanel').catch(() => undefined)
}
