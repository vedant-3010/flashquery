import { useEffect, useState } from 'react'
import { selectChart } from '@/charts/select'
import type { ChartData } from '@/charts/shape'
import type { ChartSpec } from '@/charts/spec'
import { loadChartData, needsNewData, readChartRows } from '@/engine/chartData'
import { getDb } from '@/engine/duckdb'
import type { PagedResult } from '@/engine/paging'
import type { CellValue } from '@/engine/types'
import { toAppError } from '@/lib/errors'
import { useSettingsStore } from '@/stores/settings'

export interface AutoChart {
  rows: CellValue[][]
  spec: ChartSpec
  auto: ChartSpec
  data: ChartData
}

interface Loaded {
  relation: string
  chart: AutoChart | null
  error: string | null
}

/**
 * A chart for any query result (the SQL scratchpad, F-EXPL-07): chosen by the §6 rules, read from
 * DuckDB only while `enabled` (the Chart view is open), switchable like an answer's chart.
 */
export function useAutoChart(result: PagedResult | null, enabled: boolean) {
  const currency = useSettingsStore((state) => state.currency)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const current = result && loaded?.relation === result.relation ? loaded : null
  const done = current !== null

  useEffect(() => {
    if (!result || !enabled || done) return
    const controller = new AbortController()
    const { signal } = controller
    void (async () => {
      try {
        const engine = await getDb()
        const rows = await readChartRows(engine, result, signal)
        const spec = selectChart({
          columns: result.columns,
          rows,
          rowCount: result.rowCount,
          currency,
        })
        const data = await loadChartData(engine, result, spec, rows, signal)
        if (!signal.aborted) {
          setLoaded({
            relation: result.relation,
            chart: { rows, spec, auto: spec, data },
            error: null,
          })
        }
      } catch (error) {
        if (!signal.aborted) {
          setLoaded({ relation: result.relation, chart: null, error: toAppError(error).message })
        }
      }
    })()
    return () => controller.abort()
  }, [result, enabled, done, currency])

  const setSpec = async (spec: ChartSpec) => {
    const chart = current?.chart
    if (!result || !chart) return
    const data = needsNewData(chart, spec)
      ? await loadChartData(await getDb(), result, spec, chart.rows)
      : chart.data
    setLoaded((previous) =>
      previous?.relation === result.relation && previous.chart
        ? { ...previous, chart: { ...previous.chart, spec, data } }
        : previous,
    )
  }

  return {
    chart: current?.chart ?? null,
    error: current?.error ?? null,
    loading: enabled && result !== null && current === null,
    setSpec,
  }
}
