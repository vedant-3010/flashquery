import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'

// Tree-shaken ECharts (ui rules): only the chart types and components we draw. Loaded lazily with
// the chart panel, so it stays out of the initial bundle. SVG is for "Export SVG" (F-VIZ-07).

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
  LabelLayout,
  CanvasRenderer,
  SVGRenderer,
])

export { echarts }
export type { ECharts } from 'echarts/core'
