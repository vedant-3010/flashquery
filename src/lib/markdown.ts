// A small markdown subset for dashboard text tiles (F-DASH-06): headings (#, ##, ###), paragraphs,
// bullet and numbered lists, **bold**, *italic*, `code` and [links](https://…). Parsed into plain
// data and rendered as React elements, never as HTML, so imported text can't inject markup.
// Links are kept only for http(s) and mailto.

export type Inline =
  | { kind: 'text' | 'strong' | 'em' | 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }

const SAFE_HREF = /^(https?:\/\/|mailto:)/i
const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index
    if (index > last) out.push({ kind: 'text', text: text.slice(last, index) })
    const [whole, , strong, em, emUnderscore, code, linkText, href] = match
    if (strong !== undefined) out.push({ kind: 'strong', text: strong })
    else if (em !== undefined || emUnderscore !== undefined) {
      out.push({ kind: 'em', text: em ?? emUnderscore ?? '' })
    } else if (code !== undefined) out.push({ kind: 'code', text: code })
    else if (linkText !== undefined && href !== undefined) {
      out.push(
        SAFE_HREF.test(href)
          ? { kind: 'link', text: linkText, href }
          : { kind: 'text', text: linkText },
      )
    } else out.push({ kind: 'text', text: whole })
    last = index + whole.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join(' ')) })
      paragraph = []
    }
  }
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const heading = HEADING.exec(line)
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (line.trim() === '') {
      flush()
    } else if (heading?.[1] && heading[2] !== undefined) {
      flush()
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3
      blocks.push({ kind: 'heading', level, inlines: parseInline(heading[2]) })
    } else if (bullet || numbered) {
      flush()
      const ordered = numbered !== null
      const item = parseInline((bullet ?? numbered)?.[1] ?? '')
      const previous = blocks.at(-1)
      if (previous?.kind === 'list' && previous.ordered === ordered) previous.items.push(item)
      else blocks.push({ kind: 'list', ordered, items: [item] })
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}
