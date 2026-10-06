import { COLS } from '@/dashboard/layout'
import { parseMarkdown, type Inline } from '@/lib/markdown'

// Dashboard export as one standalone HTML file (F-DASH-12): the tiles' snapshots, charts as inline
// SVG, no scripts. Everything from the user's data or files is escaped, and the file's own CSP
// forbids scripts and network access, so opening it can't run or fetch anything. Printing it gives
// the PDF. Pure: the caller renders charts to SVG (features/dashboard/exportDashboard.ts).

export const ROW_HEIGHT = 72
export const GAP = 12
export const PAGE_WIDTH = 1200

export interface RenderedTile {
  title: string
  layout: { x: number; y: number; w: number; h: number }
  body:
    | { kind: 'svg'; svg: string; label: string }
    | { kind: 'kpi'; items: { label: string; value: string }[] }
    | { kind: 'table'; columns: string[]; rows: string[][]; total: number }
    | { kind: 'text'; markdown: string }
    | { kind: 'empty'; message: string }
  /** "Snapshot from …", or null for text tiles. */
  note: string | null
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Tile size in pixels at PAGE_WIDTH, matching the app's 12-column grid. */
export function tileSize(layout: RenderedTile['layout']) {
  const column = (PAGE_WIDTH - GAP * (COLS - 1)) / COLS
  return {
    width: Math.round(layout.w * column + (layout.w - 1) * GAP),
    height: layout.h * ROW_HEIGHT + (layout.h - 1) * GAP,
  }
}

function inlineHtml(inlines: Inline[]): string {
  return inlines
    .map((inline) => {
      const text = escapeHtml(inline.text)
      switch (inline.kind) {
        case 'strong':
          return `<strong>${text}</strong>`
        case 'em':
          return `<em>${text}</em>`
        case 'code':
          return `<code>${text}</code>`
        case 'link':
          return `<a href="${escapeHtml(inline.href)}" rel="noopener noreferrer">${text}</a>`
        case 'text':
          return text
      }
    })
    .join('')
}

export function markdownHtml(markdown: string): string {
  return parseMarkdown(markdown)
    .map((block) => {
      if (block.kind === 'heading')
        return `<h${block.level + 2}>${inlineHtml(block.inlines)}</h${block.level + 2}>`
      if (block.kind === 'paragraph') return `<p>${inlineHtml(block.inlines)}</p>`
      const tag = block.ordered ? 'ol' : 'ul'
      return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${tag}>`
    })
    .join('')
}

function bodyHtml(body: RenderedTile['body']): string {
  switch (body.kind) {
    case 'svg':
      // ECharts' SVG renderer escapes the text it draws.
      return `<figure role="img" aria-label="${escapeHtml(body.label)}">${body.svg}</figure>`
    case 'kpi':
      return `<dl class="kpis">${body.items
        .map(
          (item) =>
            `<div>${item.label ? `<dt>${escapeHtml(item.label)}</dt>` : ''}<dd>${escapeHtml(item.value)}</dd></div>`,
        )
        .join('')}</dl>`
    case 'table': {
      const head = body.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
      const rows = body.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('')
      const more =
        body.total > body.rows.length
          ? `<p class="note">First ${body.rows.length} of ${body.total} rows.</p>`
          : ''
      return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>${more}`
    }
    case 'text':
      return `<div class="md">${markdownHtml(body.markdown)}</div>`
    case 'empty':
      return `<p class="note">${escapeHtml(body.message)}</p>`
  }
}

const STYLE = `
*{box-sizing:border-box}body{margin:0;background:#f6f6f7;color:#1a1a1a;font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:${PAGE_WIDTH}px;margin:24px auto}header{margin-bottom:16px}h1{font-size:22px;margin:0 0 4px}
.meta,.note{color:#5f6368;font-size:12px;margin:0}.grid{display:grid;grid-template-columns:repeat(${COLS},1fr);grid-auto-rows:${ROW_HEIGHT}px;gap:${GAP}px}
section{background:#fff;border:1px solid #e3e3e6;border-radius:12px;padding:8px 10px;overflow:hidden;display:flex;flex-direction:column;break-inside:avoid}
h2{font-size:14px;font-weight:600;margin:0 0 4px}figure{margin:0;flex:1;min-height:0}figure svg{width:100%;height:100%}
.kpis{display:flex;flex-wrap:wrap;gap:16px;margin:4px 0}.kpis dt{color:#5f6368;font-size:12px}.kpis dd{margin:0;font-size:26px;font-weight:700}
.table{overflow:auto;flex:1}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #eee;padding:3px 6px;text-align:left;white-space:nowrap}
.md h3,.md h4,.md h5{margin:4px 0}.md p,.md ul,.md ol{margin:4px 0}
@media print{body{background:#fff}main{margin:0 auto}section{border-color:#ccc}}
@page{size:landscape;margin:12mm}`

export function dashboardHtml({
  title,
  tiles,
  exportedAt,
  filters,
}: {
  title: string
  tiles: RenderedTile[]
  /** Already formatted for the reader's locale. */
  exportedAt: string
  /** Active dashboard filters, as shown in the app. */
  filters: string[]
}): string {
  const sections = tiles
    .map((tile) => {
      const { x, y, w, h } = tile.layout
      const place = `grid-column:${x + 1} / span ${w};grid-row:${y + 1} / span ${h}`
      const note = tile.note ? `<p class="note">${escapeHtml(tile.note)}</p>` : ''
      return `<section style="${place}"><h2>${escapeHtml(tile.title)}</h2>${bodyHtml(tile.body)}${note}</section>`
    })
    .join('\n')
  const filterLine = filters.length > 0 ? ` · Filtered: ${filters.map(escapeHtml).join(', ')}` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header><h1>${escapeHtml(title)}</h1><p class="meta">Exported from flashQuery on ${escapeHtml(exportedAt)}${filterLine}. Data as of each tile's snapshot.</p></header>
<div class="grid">
${sections}
</div>
</main>
</body>
</html>
`
}
