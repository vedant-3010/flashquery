import { useEffect, useState } from 'react'

/** Milliseconds since `startedAt`, re-rendering every `intervalMs` while `active`. */
export function useElapsed(startedAt: number, active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(handle)
  }, [active, intervalMs])
  return Math.max(0, now - startedAt)
}
