import type { EChartsOption } from 'echarts'
import { useEffect, useRef, type RefObject } from 'react'
import { echarts, type ECharts } from '@/features/charts/echarts'
import { cn } from '@/lib/utils'

interface EChartProps {
  option: EChartsOption
  /** Text alternative for the chart (role="img"). */
  label: string
  className?: string
  /** Receives the instance, for export. */
  instanceRef?: RefObject<ECharts | null>
  /** A click on a bar or slice, with its category name (dashboard cross-filtering, F-DASH-11). */
  onSelect?: (name: string) => void
}

/**
 * The only ECharts wrapper (ui rules): init once per mount (canvas), setOption without merging on
 * every change, resize with the container, dispose on unmount. The host's width ignores the canvas
 * (`contain: inline-size`): otherwise the canvas, sized in pixels, holds every grid around it at its
 * old width when the window narrows, and the chart never sees its container shrink.
 */
export function EChart({ option, label, className, instanceRef, onSelect }: EChartProps) {
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<ECharts | null>(null)
  // The latest handler, read by the click listener registered once at init.
  const select = useRef(onSelect)
  useEffect(() => {
    select.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const element = container.current
    if (!element) return
    const instance = echarts.init(element, null, { renderer: 'canvas' })
    chart.current = instance
    if (instanceRef) instanceRef.current = instance
    instance.on('click', (params) => {
      if (typeof params.name === 'string' && params.name !== '') select.current?.(params.name)
    })
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

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      className={cn('contain-inline-size', className)}
    />
  )
}
