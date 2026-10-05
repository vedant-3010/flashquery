import { isAdditiveName } from '@/charts/classify'
import { prepare } from '@/charts/shape'
import { LIGHT_THEME } from '@/charts/theme'
import { describeChart, toOption } from '@/charts/toOption'
import { describeFilter } from '@/dashboard/describeFilter'
import { dashboardHtml, tileSize, type RenderedTile } from '@/dashboard/exportHtml'
import type { Dashboard, DashboardTile } from '@/dashboard/schema'
import { isIdentifierLike } from '@/engine/roles'
import { formatCell, formatMoment, formatValue } from '@/lib/format'

// Dashboard export (F-DASH-12): renders each tile from its snapshot (charts with ECharts' SVG
// renderer, server-side style, no DOM) into the standalone HTML of dashboard/exportHtml.ts.

const TABLE_ROWS = 50
/** Room for the tile's title and note around the chart. */
const CHROME_HEIGHT = 58

async function renderTile(tile: DashboardTile, locale: string): Promise<RenderedTile> {
  const base = { title: tile.title, layout: tile.layout }
  if (tile.type === 'text')
    return { ...base, body: { kind: 'text', markdown: tile.text ?? '' }, note: null }
  const snapshot = tile.snapshot
  if (!snapshot) return { ...base, body: { kind: 'empty', message: 'Not run yet.' }, note: null }
  const note = `Snapshot from ${formatMoment(snapshot.at, locale)}${snapshot.filtered ? ' (filtered)' : ''}`
  const table = (): RenderedTile => ({
    ...base,
    note,
    body: {
      kind: 'table',
      columns: snapshot.columns.map((c) => c.name),
      rows: snapshot.rows.slice(0, TABLE_ROWS).map((row) =>
        row.map((value, i) => {
          const column = snapshot.columns[i]
          if (value === null || value === undefined || !column) return ''
          return formatCell(
            value,
            { logicalType: column.logicalType, plainInteger: isIdentifierLike(column.name) },
            locale,
          )
        }),
      ),
      total: snapshot.rowCount,
    },
  })
  const spec = tile.chartSpec
  if (tile.type === 'table' || !spec || spec.type === 'table') return table()

  const data = {
    columns: snapshot.columns,
    rows: snapshot.rows,
    rowCount: snapshot.rowCount,
    sampling: snapshot.sampling,
  }
  const prepared = prepare(spec, data, spec.y.every(isAdditiveName))
  if (prepared.kind === 'kpi') {
    return {
      ...base,
      note,
      body: {
        kind: 'kpi',
        items: prepared.items.map((item) => ({
          // One KPI: the tile title already says what it is (as in the app).
          label: prepared.items.length === 1 ? '' : item.label,
          value: formatValue(item.value, spec.format, locale, { compact: true }),
        })),
      },
    }
  }
  const option = toOption(spec, prepared, { theme: LIGHT_THEME, locale, animation: false })
  if (!option) return table()
  const { echarts } = await import('@/features/charts/echarts')
  const size = tileSize(tile.layout)
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: size.width - 20,
    height: Math.max(80, size.height - CHROME_HEIGHT),
  })
  try {
    chart.setOption(option)
    return {
      ...base,
      note,
      body: {
        kind: 'svg',
        svg: chart.renderToSVGString(),
        label: describeChart(spec, prepared, locale),
      },
    }
  } finally {
    chart.dispose()
  }
}

/** The dashboard as one standalone HTML file. */
export async function renderDashboardHtml(
  dashboard: Dashboard,
  locale: string,
): Promise<{ fileName: string; html: string }> {
  const tiles = [...dashboard.tiles].sort(
    (a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x,
  )
  const rendered = await Promise.all(tiles.map((tile) => renderTile(tile, locale)))
  const html = dashboardHtml({
    title: dashboard.name,
    tiles: rendered,
    exportedAt: formatMoment(Date.now(), locale),
    filters: dashboard.filters.map(describeFilter),
  })
  const slug =
    dashboard.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'dashboard'
  return { fileName: `${slug}.html`, html }
}

/** Opens the export in a new tab and starts printing (Save as PDF). False when pop-ups are blocked. */
export function printDashboardHtml(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const tab = window.open(url, '_blank')
  if (!tab) {
    URL.revokeObjectURL(url)
    return false
  }
  tab.addEventListener('load', () => tab.print(), { once: true })
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
