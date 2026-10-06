import { useCallback, useEffect, useRef, useState } from 'react'
import { FINAL_T } from '@/landing/film/filmScript'

/**
 * Milliseconds into the hero film (filmScript.ts), advanced with requestAnimationFrame while
 * `running`. With reduced motion it stays on the final frame and never ticks.
 */
export function useFilmClock({ running, reduced }: { running: boolean; reduced: boolean }) {
  const [time, setTime] = useState(0)
  const elapsed = useRef(0)

  useEffect(() => {
    if (!running || reduced) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      // Cap the step so a backgrounded tab doesn't jump the film forward.
      elapsed.current += Math.min(64, now - last)
      last = now
      setTime(elapsed.current)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, reduced])

  const replay = useCallback(() => {
    elapsed.current = 0
    setTime(0)
  }, [])

  return { time: reduced ? FINAL_T : time, replay }
}
