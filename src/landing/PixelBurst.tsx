import { m, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

// A small pixel-art burst beside a headline's last word (D99), on a grid around (0, 0): five rays
// of square pixels, each listed from the centre outwards. The word sits to the left and below, so
// no rays point that way.
const RAYS: [number, number][][] = [
  [
    [-3, -3],
    [-4, -4],
    [-5, -5],
  ],
  [
    [0, -4],
    [0, -5],
    [0, -6],
    [0, -7],
  ],
  [
    [3, -3],
    [4, -4],
    [5, -5],
  ],
  [
    [4, 0],
    [5, 0],
    [6, 0],
    [7, 0],
  ],
  [
    [3, 3],
    [4, 4],
    [5, 5],
  ],
]
/** Seconds between one pixel and the next along a ray, and between the rays starting. */
const STEP = 0.06
const RAY_STAGGER = 0.025

/**
 * Pops in pixel by pixel (no fades: it is pixel art), then plays again when the pointer enters
 * its headline. Decoration only; still, and fully drawn, with reduced motion.
 */
export function PixelBurst({ delay = 0.7 }: { delay?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  const reduced = useReducedMotion() ?? false
  const [run, setRun] = useState(0)

  useEffect(() => {
    const heading = ref.current?.closest('h1, h2')
    if (!heading || reduced) return
    let last = 0
    const replay = () => {
      // Not again while it's still drawing.
      if (performance.now() - last < 900) return
      last = performance.now()
      setRun((n) => n + 1)
    }
    heading.addEventListener('pointerenter', replay)
    return () => heading.removeEventListener('pointerenter', replay)
  }, [reduced])

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox="-5 -7 13 13"
      shapeRendering="crispEdges"
      fill="currentColor"
      className="pointer-events-none absolute top-[0.03em] left-full ml-[-0.2em] size-[0.7em] text-accent/50"
    >
      {/* A new key draws it again from nothing. */}
      <g key={run}>
        {RAYS.flatMap((ray, r) =>
          ray.map(([x, y], i) => (
            <m.rect
              key={`${r}-${i}`}
              x={x}
              y={y}
              width={1}
              height={1}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0,
                delay: (run === 0 ? delay : 0) + i * STEP + r * RAY_STAGGER,
              }}
            />
          )),
        )}
      </g>
    </svg>
  )
}
