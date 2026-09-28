import type { EChartsOption } from 'echarts'
import { useEffect, useRef, type RefObject } from 'react'
import { echarts, type ECharts } from '@/features/charts/echarts'

interface EChartProps {
  option: EChartsOption
  /** Text alternative for the chart (role="img"). */
  label: string
  className?: string
  /** Receives the instance, for export. */
  instanceRef?: RefObject<ECharts | null>
}

/**
 * The only ECharts wrapper (ui rules): init once per mount (canvas), setOption without merging on
 * every change, resize with the container, dispose on unmount.
 */
export function EChart({ option, label, className, instanceRef }: EChartProps) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<ECharts | null>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const instance = echarts.init(element, null, { renderer: 'canvas' })
    chart.current = instance
    if (instanceRef) instanceRef.current = instance
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
      if (instanceRef) instanceRef.current = null
    }
  }, [instanceRef])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={container} role="img" aria-label={label} className={className} />
}
