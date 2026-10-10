import type { ReactNode } from 'react'
import { Reveal } from '@/landing/Reveal'

/** A section's label above its headline: mono capitals in the accent, after a short accent rule. */
export const EYEBROW =
  'flex items-center gap-3 font-mono text-[11.5px] tracking-[0.08em] text-accent-ink uppercase'

export function EyebrowRule() {
  return <span className="h-px w-6 shrink-0 bg-accent" aria-hidden />
}

/** The eyebrow, rising in with its section (Reveal). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Reveal as="p" className={EYEBROW}>
      <EyebrowRule />
      {children}
    </Reveal>
  )
}
