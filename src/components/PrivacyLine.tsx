import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The privacy promise under a heading; the shield stays on the first line however the text wraps. */
export function PrivacyLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-sm text-balance text-muted-foreground', className)}>
      <ShieldCheck
        className="mr-1.5 inline size-4 -translate-y-px align-middle text-primary"
        aria-hidden
      />
      {children}
    </p>
  )
}
