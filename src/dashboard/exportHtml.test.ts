import { describe, expect, it } from 'vitest'
import { dashboardHtml, markdownHtml, tileSize, type RenderedTile } from './exportHtml'

// F-DASH-12: a standalone, script-free HTML export; everything from the data is escaped.

const tile = (body: RenderedTile['body'], title = 'Revenue'): RenderedTile => ({
  title,
  layout: { x: 0, y: 0, w: 6, h: 4 },
  body,
  note: 'Snapshot from Oct 6, 2026',
})

describe('dashboard HTML export (F-DASH-12)', () => {
  it('lays tiles out on the 12-column grid', () => {
    expect(tileSize({ x: 0, y: 0, w: 12, h: 2 })).toEqual({ width: 1200, height: 156 })
    const html = dashboardHtml({
      title: 'Sales',
      tiles: [tile({ kind: 'kpi', items: [{ label: 'Total', value: '$1.4B' }] })],
      exportedAt: 'Oct 6, 2026',
      filters: ['Region: APAC'],
    })
    expect(html).toContain('grid-column:1 / span 6;grid-row:1 / span 4')
    expect(html).toContain('<dd>$1.4B</dd>')
    expect(html).toContain('Filtered: Region: APAC')
  })

  it('has no scripts, forbids them, and escapes data from the files', () => {
    const hostile = '<script>alert(1)</script>'
    const html = dashboardHtml({
      title: hostile,
      tiles: [
        tile({ kind: 'table', columns: [hostile], rows: [[hostile]], total: 120 }, hostile),
        tile({ kind: 'text', markdown: `## Notes ${hostile}\n\n- [x](javascript:alert(1))` }),
      ],
      exportedAt: 'today',
      filters: [],
    })
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('First 1 of 120 rows.')
    expect(html).not.toContain('href="javascript')
  })

  it('renders the markdown subset', () => {
    expect(markdownHtml('# Title\n\nSome **bold** and `code`.\n\n1. one\n2. two')).toBe(
      '<h3>Title</h3><p>Some <strong>bold</strong> and <code>code</code>.</p><ol><li>one</li><li>two</li></ol>',
    )
  })
})
