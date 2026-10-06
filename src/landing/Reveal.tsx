import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { IN_VIEW, reveal, stagger } from '@/landing/motion'

/** Rises 8 px and fades in once, when scrolled into view; `group` staggers its Reveal children. */
export function Reveal({
  children,
  className,
  group = false,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  group?: boolean
  as?: 'div' | 'section' | 'li' | 'ul' | 'p'
}) {
  const Tag = m[as]
  return (
    <Tag
      className={className}
      variants={group ? stagger : reveal}
      initial="hidden"
      whileInView="shown"
      viewport={IN_VIEW}
    >
      {children}
    </Tag>
  )
}
