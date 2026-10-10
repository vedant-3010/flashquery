import { Loader2, Receipt, ShoppingBag, Upload, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SampleId } from '@/engine/samples'
import { cn } from '@/lib/utils'

// The ways to start (F-HOME-03, D117), the same on Home and in an empty project: your own file
// first, then the two samples demo mode answers about (finance, then sales).

export type StartChoice = 'upload' | SampleId

interface Card {
  choice: StartChoice
  icon: LucideIcon
  title: string
  description: string
  sample: boolean
}

const CARDS: Card[] = [
  {
    choice: 'upload',
    icon: Upload,
    title: 'Your file',
    description: 'Excel, CSV and more. Read on this device, never uploaded.',
    sample: false,
  },
  {
    choice: 'company-finances',
    icon: Receipt,
    title: 'Company finances',
    description: 'Invoices and bills: who owes you, margins, spend and cash flow.',
    sample: true,
  },
  {
    choice: 'global-sales-1m',
    icon: ShoppingBag,
    title: 'Global Sales',
    description: 'A million orders by region, product and channel.',
    sample: true,
  },
]

export function StartCards({
  onChoose,
  busy = null,
  className,
}: {
  onChoose: (choice: StartChoice) => void
  /** The choice being loaded: its card shows a spinner, and the cards wait. */
  busy?: StartChoice | null
  className?: string
}) {
  return (
    <ul className={cn('grid w-full gap-3 sm:grid-cols-3', className)} aria-label="Ways to start">
      {CARDS.map(({ choice, icon: Icon, title, description, sample }) => (
        <li key={choice} className="flex">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onChoose(choice)}
            className="grid w-full content-start gap-1 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70"
          >
            <span className="flex items-center justify-between gap-2">
              {busy === choice ? (
                <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              ) : (
                <Icon className="size-5 text-primary" aria-hidden />
              )}
              {sample && <Badge variant="secondary">Sample</Badge>}
            </span>
            <span className="mt-1 text-sm font-medium">{title}</span>
            <span className="text-xs text-pretty text-muted-foreground">{description}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
