import type { BenchResult } from '@/engine/bench'
import { percentile } from '@/engine/bench'
import type { Engine } from '@/engine/connection'

// Benchmark (F-PERF-04): the parts that need a browser. Chart render times ECharts drawing 5,000
// points; grid scroll watches for long tasks while the 1M-row grid scrolls top to bottom.

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function measureChartRender(): Promise<BenchResult> {
  const { echarts } = await import('@/features/charts/echarts')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:400px'
  document.body.append(host)
  const chart = echarts.init(host, undefined, { renderer: 'canvas' })
  const times: number[] = []
  try {
    for (let run = 0; run < 6; run += 1) {
      const data = Array.from({ length: 5_000 }, (_, i) => [
        i,
        Math.sin(i / 50) * 100 + i / 10 + run,
      ])
      const started = performance.now()
      chart.setOption(
        {
          animation: false,
          xAxis: { type: 'value' },
          yAxis: { type: 'value' },
          tooltip: { trigger: 'axis' },
          series: [{ type: 'line', data, showSymbol: false, sampling: 'lttb' }],
        },
        { notMerge: true },
      )
      chart.getZr().flush() // paint now, inside the timing
      times.push(performance.now() - started)
      await nextFrame()
    }
  } finally {
    chart.dispose()
    host.remove()
  }
  return {
    id: 'chart',
    label: 'Chart render (5,000 points)',
    value: percentile(times.slice(1), 50),
    budget: 100,
    detail: 'median of 5',
  }
}

/** Scrolls `scroller` from top to bottom over ~2 s and reports the longest long task. */
export async function measureGridScroll(scroller: HTMLElement, rows: number): Promise<BenchResult> {
  const supported = PerformanceObserver.supportedEntryTypes.includes('longtask')
  const durations: number[] = []
  const observer = supported
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) durations.push(entry.duration)
      })
    : null
  observer?.observe({ type: 'longtask' })
  const frames = 120
  const distance = scroller.scrollHeight - scroller.clientHeight
  for (let frame = 1; frame <= frames; frame += 1) {
    scroller.scrollTop = (distance * frame) / frames
    await nextFrame()
  }
  await wait(800) // pages still loading after the last frame
  observer?.disconnect()
  return {
    id: 'scroll',
    label: `Grid scroll through ${rows.toLocaleString('en-US')} rows: longest task`,
    value: supported ? Math.max(0, ...durations) : null,
    budget: supported ? 50 : null,
    detail: supported
      ? `${durations.length} long ${durations.length === 1 ? 'task' : 'tasks'}`
      : 'long tasks not reported by this browser',
  }
}

export async function measureMemory(engine: Engine): Promise<BenchResult[]> {
  const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
  let duckdb: number | null = null
  try {
    const row = (
      await engine.run('SELECT sum(memory_usage_bytes) AS n FROM duckdb_memory()')
    ).toArray()[0] as { n?: number | bigint } | undefined
    duckdb = row?.n === undefined ? null : Number(row.n) / 1e6
  } catch {
    duckdb = null
  }
  return [
    {
      id: 'memory-js',
      label: 'JS heap',
      value: heap === undefined ? null : heap / 1e6,
      budget: null,
      detail: heap === undefined ? 'not reported by this browser' : null,
    },
    { id: 'memory-duckdb', label: 'DuckDB memory', value: duckdb, budget: null, detail: null },
  ]
}

/** Load timings of this page (the same bundle as the app's landing page). */
export function pageTimings(readyAt: number | null): BenchResult[] {
  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined
  return [
    {
      id: 'interactive',
      label: 'Page interactive (this load)',
      value: navigation ? navigation.domInteractive : null,
      budget: 2_000,
      detail: null,
    },
    {
      id: 'duckdb-ready',
      label: 'DuckDB ready after page load',
      value: readyAt,
      budget: 3_000,
      detail: 'cold; < 1 s when cached',
    },
  ]
}
