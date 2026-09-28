import type { EChartsOption } from 'echarts'
import { Download } from 'lucide-react'
import { useState, type RefObject } from 'react'
import type { ChartTheme } from '@/charts/theme'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { echarts, type ECharts } from '@/features/charts/echarts'
import { dataUrlToBlob, downloadBytes, downloadDataUrl, fileNameFor } from '@/lib/download'
import { toAppError } from '@/lib/errors'

interface ChartExportMenuProps {
  chartRef: RefObject<ECharts | null>
  option: EChartsOption
  theme: ChartTheme
  title: string
}

/** PNG, SVG and copy-to-clipboard for the chart on screen (F-VIZ-07). */
export function ChartExportMenu({ chartRef, option, theme, title }: ChartExportMenuProps) {
  const [message, setMessage] = useState<string | null>(null)
  const name = fileNameFor(title)

  const png = () =>
    chartRef.current?.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: theme.background,
    }) ?? null

  const run = async (task: () => Promise<string | null> | string | null) => {
    try {
      setMessage(await task())
    } catch (error) {
      setMessage(`Export failed: ${toAppError(error).message}`)
    }
  }

  const svg = () => {
    const chart = chartRef.current
    if (!chart) return null
    // A server-side-style SVG instance of the same option, the same size as the chart on screen.
    const copy = echarts.init(null, null, {
      renderer: 'svg',
      ssr: true,
      width: chart.getWidth(),
      height: chart.getHeight(),
    })
    try {
      copy.setOption({ ...option, animation: false, backgroundColor: theme.background })
      const text = copy.renderToSVGString()
      downloadBytes(new TextEncoder().encode(text), `${name}.svg`, 'image/svg+xml')
      return null
    } finally {
      copy.dispose()
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" variant="ghost">
            <Download aria-hidden />
            Export chart
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onSelect={() =>
              void run(() => {
                const url = png()
                if (url) downloadDataUrl(url, `${name}.png`)
                return null
              })
            }
          >
            Download PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void run(svg)}>Download SVG</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              void run(async () => {
                const url = png()
                if (!url) return null
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': dataUrlToBlob(url) }),
                ])
                return 'Chart copied as an image.'
              })
            }
          >
            Copy image
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {message && (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}
    </>
  )
}
