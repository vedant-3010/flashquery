// flashQuery's mark (PRD D99): a speech bubble ("ask") holding three rising bars ("data"); the tallest
// bar carries the accent. Shared by the landing page, the app's top bar and the favicon.

const BUBBLE =
  'M6 3.5h12A3.5 3.5 0 0 1 21.5 7v7a3.5 3.5 0 0 1-3.5 3.5h-6.4l-4.3 3.2a.6.6 0 0 1-.96-.48V17.5H6A3.5 3.5 0 0 1 2.5 14V7A3.5 3.5 0 0 1 6 3.5Z'

// The brand violet (the page accent), and a much lighter one for dark backgrounds.
const ACCENT = { light: '#5500AA', dark: '#B98AFF' }

export function BrandMark({
  className,
  onDark = false,
}: {
  className?: string
  /** Drawn on a dark background (the app's dark theme): use the lighter violet. */
  onDark?: boolean
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d={BUBBLE} stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
      <rect x="7" y="11" width="2.4" height="3" rx="0.6" fill="currentColor" />
      <rect x="10.8" y="9" width="2.4" height="5" rx="0.6" fill="currentColor" />
      <rect
        x="14.6"
        y="7"
        width="2.4"
        height="7"
        rx="0.6"
        fill={onDark ? ACCENT.dark : ACCENT.light}
      />
    </svg>
  )
}
