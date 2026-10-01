import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

describe('parseMarkdown (F-DASH-06)', () => {
  it('reads headings, paragraphs and lists', () => {
    expect(
      parseMarkdown('# Sales\n\nRevenue by region,\nfor **2025**.\n\n- APAC\n- LATAM\n1. one'),
    ).toEqual([
      { kind: 'heading', level: 1, inlines: [{ kind: 'text', text: 'Sales' }] },
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'Revenue by region, for ' },
          { kind: 'strong', text: '2025' },
          { kind: 'text', text: '.' },
        ],
      },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'APAC' }], [{ kind: 'text', text: 'LATAM' }]],
      },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'one' }]] },
    ])
  })

  it('keeps only safe links and never interprets HTML', () => {
    expect(parseInline('[docs](https://duckdb.org) and [x](javascript:alert(1))')).toEqual([
      { kind: 'link', text: 'docs', href: 'https://duckdb.org' },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'x' },
      { kind: 'text', text: ')' },
    ])
    expect(parseInline('<img src=x onerror=alert(1)> *hi* `code`')).toEqual([
      { kind: 'text', text: '<img src=x onerror=alert(1)> ' },
      { kind: 'em', text: 'hi' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'code' },
    ])
  })
})
