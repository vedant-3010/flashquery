import { useEffect, useState, type RefObject } from 'react'

/**
 * Presentation mode (F-DASH-13): `element` goes full screen; where the Fullscreen API isn't available
 * (or is refused) it covers the window instead. Esc ends it either way.
 */
export function usePresentation(element: RefObject<HTMLElement | null>) {
  const [presenting, setPresenting] = useState(false)

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Browsers usually take Esc to leave full screen; when the page gets it (no full screen, or a
  // headless browser), end the presentation here.
  useEffect(() => {
    if (!presenting) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      setPresenting(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [presenting])

  return {
    presenting,
    start: () => {
      setPresenting(true)
      element.current?.requestFullscreen?.().catch(() => undefined)
    },
    stop: () => {
      setPresenting(false)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    },
  }
}
