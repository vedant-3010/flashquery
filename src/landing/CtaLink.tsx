import { m } from 'motion/react'
import type { ReactNode } from 'react'
import { cx } from '@/landing/cx'
import { SNAPPY } from '@/landing/motion'

/**
 * The page's buttons (links styled as buttons): ink for the main action, a quiet outline otherwise.
 * They press in slightly, and the arrow slides as the pointer arrives.
 */
export function CtaLink({
  href,
  children,
  variant = 'ink',
  size = 'md',
  className,
}: {
  href: string
  children: ReactNode
  variant?: 'ink' | 'outline'
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <m.a
      href={href}
      whileTap={{ scale: 0.97 }}
      transition={SNAPPY}
      className={cx(
        'group inline-flex items-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors duration-200',
        size === 'md' ? 'h-11 px-5 text-[15px]' : 'h-8 px-3.5 text-[13px]',
        variant === 'ink'
          ? 'bg-ink text-paper hover:bg-ink-soft'
          : 'border border-hairline-strong text-ink hover:border-ink hover:bg-paper-deep/60',
        className,
      )}
    >
      {children}
      <svg
        viewBox="0 0 16 16"
        className="size-3.5 transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover:translate-x-0.5"
        aria-hidden
      >
        <path
          d="M2.5 8h10M8.5 3.5 13 8l-4.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </m.a>
  )
}

/** A text link whose underline draws in from the left. */
export function TextLink({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a href={href} className={cx('group inline-flex items-center gap-1', className)}>
      <span className="underline-draw pb-px">{children}</span>
    </a>
  )
}
