import { animate, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/** A number that counts up once when it scrolls into view (tabular figures, so nothing jumps). */
export function CountUp({
  to,
  format,
  duration = 1.4,
  className,
}: {
  to: number
  format: (value: number) => string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' })
  const reduced = useReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView || reduced) return
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setValue,
    })
    return () => controls.stop()
  }, [inView, reduced, to, duration])

  return (
    <span ref={ref} className={`tabular ${className ?? ''}`}>
      {format(reduced ? to : value)}
    </span>
  )
}
