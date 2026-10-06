import type { Transition, Variants } from 'motion/react'

// One motion vocabulary for the whole landing page (PRD D99): a few springs and one easing, so
// every interaction feels like the same hand made it. Durations stay short; nothing flies in.

/** Quick and firm: buttons, toggles, small things that follow the pointer. */
export const SNAPPY: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.6 }

/** Soft settle: cards, panels, bars growing. */
export const SETTLE: Transition = { type: 'spring', stiffness: 170, damping: 24, mass: 0.9 }

/** A slight bounce, used once: the file dropping into the hero. */
export const DROP: Transition = { type: 'spring', stiffness: 260, damping: 15, mass: 0.8 }

export const EASE_OUT: [number, number, number, number] = [0.25, 1, 0.5, 1]

/** Reveal on scroll: 8 px rise and fade, children staggered. */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
}

export const stagger: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

/** whileInView settings: once, a little before the element is fully on screen. */
export const IN_VIEW = { once: true, margin: '0px 0px -12% 0px' } as const
