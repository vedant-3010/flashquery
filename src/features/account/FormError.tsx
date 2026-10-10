import { CircleAlert } from 'lucide-react'
import type { AppErrorData } from '@/lib/errors'

/** A form's error: one line, the service's wording behind "Details" (F-ACCT-01). */
export function FormError({ error }: { error: AppErrorData | null }) {
  if (!error) return null
  return (
    <div role="alert" className="grid gap-1 text-sm text-destructive">
      <p className="flex items-start gap-1.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {error.message}
      </p>
      {error.detail && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Details</summary>
          {error.detail}
        </details>
      )}
    </div>
  )
}
