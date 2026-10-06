import { m, useReducedMotion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE_OUT } from '@/landing/motion'

// Where each file starts, relative to the button's centre, and where it pauses just above it.
const FILES = [
  { name: 'sales.csv', from: { x: -150, y: -78, rotate: -12 }, over: -34 },
  { name: 'clients.csv', from: { x: 14, y: -112, rotate: 9 }, over: 4 },
  { name: 'geo.csv', from: { x: 146, y: -72, rotate: 15 }, over: 36 },
]
/** Seconds: each file's glide, and the gap between one file and the next. */
const GLIDE = 1.25
const STAGGER = 0.22
const EASE_IN: [number, number, number, number] = [0.5, 0, 0.75, 0]

// The button's bump: a small swell as each file goes in, a bigger one for the last. Keyframe times
// run from the first file going in to the last one settling.
const ARRIVALS = FILES.map((_, i) => i * STAGGER)
const BUMP_SPAN = (ARRIVALS.at(-1) ?? 0) + 0.3
const BUMP = {
  scale: [1, ...FILES.flatMap((_, i) => [i === FILES.length - 1 ? 1.05 : 1.025, 1])],
  times: [
    0,
    ...ARRIVALS.flatMap((at, i) => [
      (at + 0.07) / BUMP_SPAN,
      i === FILES.length - 1 ? 1 : (at + 0.2) / BUMP_SPAN,
    ]),
  ],
}

/** It plays when the button scrolls into the middle of the screen (below the top fifth, above the
 * bottom 30%), where it gets noticed, and again each time it comes back. */
const VIEWPORT = { margin: '-20% 0px -30% 0px' } as const

interface FileCue {
  file: (typeof FILES)[number]
  start: number
}

const fileVariants: Variants = {
  // Back at the start, out of sight; instant, so leaving the view never shows.
  rest: ({ file }: FileCue) => ({
    opacity: 0,
    x: file.from.x,
    y: file.from.y,
    rotate: file.from.rotate,
    transition: { duration: 0 },
  }),
  drop: ({ file, start }: FileCue) => ({
    x: [file.from.x, file.over, 0],
    y: [file.from.y, -36, 0],
    rotate: [file.from.rotate, file.from.rotate * 0.3, 0],
    opacity: 1,
    // It ends behind the button; hide it only then, so nothing fades in sight.
    transitionEnd: { opacity: 0 },
    transition: {
      delay: start,
      duration: GLIDE,
      times: [0, 0.68, 1],
      // Glide in and slow down above the button, then drop into it.
      ease: [EASE_OUT, EASE_IN],
      opacity: { delay: start, duration: 0.2 },
    },
  }),
}

const bumpVariants: Variants = {
  rest: { scale: 1 },
  drop: (delay: number) => ({
    scale: BUMP.scale,
    transition: { delay: delay + GLIDE, duration: BUMP_SPAN, times: BUMP.times, ease: 'easeOut' },
  }),
}

function FileGlyph() {
  return (
    <svg viewBox="0 0 12 14" className="h-3 w-2.5 shrink-0" aria-hidden>
      <path d="M1 1h6.5L11 4.5V13H1z" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7.5 1v3.5H11" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

/**
 * A call to action that a few files glide onto and slip into as it scrolls into view: the way
 * you'd drop files into the app. Decoration only: hidden from assistive tech, and left out with
 * reduced motion.
 */
export function FileDrop({ children, delay = 0.15 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion() ?? false

  return (
    <m.div
      className="relative"
      initial="rest"
      whileInView={reduced ? undefined : 'drop'}
      viewport={VIEWPORT}
    >
      {!reduced &&
        FILES.map((file, i) => (
          <m.span
            key={file.name}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-md border border-hairline-strong bg-panel px-2 py-1 font-mono text-[11px] whitespace-nowrap text-ink shadow-[0_8px_16px_-10px_rgba(21,21,21,.5)]"
            variants={fileVariants}
            custom={{ file, start: delay + i * STAGGER } satisfies FileCue}
          >
            <FileGlyph />
            {file.name}
          </m.span>
        ))}
      {/* Above the files, so they slip behind it. */}
      <m.div className="relative z-10" variants={bumpVariants} custom={delay}>
        {children}
      </m.div>
    </m.div>
  )
}
