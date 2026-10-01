import { useMemo, type ReactNode } from 'react'
import { parseMarkdown, type Inline } from '@/lib/markdown'

function renderInline(inline: Inline, key: number): ReactNode {
  switch (inline.kind) {
    case 'strong':
      return <strong key={key}>{inline.text}</strong>
    case 'em':
      return <em key={key}>{inline.text}</em>
    case 'code':
      return (
        <code key={key} className="rounded bg-muted px-1 font-mono text-[0.9em]">
          {inline.text}
        </code>
      )
    case 'link':
      return (
        <a
          key={key}
          href={inline.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {inline.text}
        </a>
      )
    case 'text':
      return inline.text
  }
}

const HEADINGS = {
  1: 'text-lg font-semibold',
  2: 'text-base font-semibold',
  3: 'text-sm font-semibold',
}

/** Text tiles (F-DASH-06): the markdown subset of src/lib/markdown.ts, as React elements. */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return (
    <div className="grid gap-2 text-sm">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Tag = `h${block.level + 2}` as 'h3' | 'h4' | 'h5'
          return (
            <Tag key={index} className={HEADINGS[block.level]}>
              {block.inlines.map(renderInline)}
            </Tag>
          )
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return (
            <List key={index} className={`${block.ordered ? 'list-decimal' : 'list-disc'} pl-5`}>
              {block.items.map((item, i) => (
                <li key={i}>{item.map(renderInline)}</li>
              ))}
            </List>
          )
        }
        return <p key={index}>{block.inlines.map(renderInline)}</p>
      })}
    </div>
  )
}
