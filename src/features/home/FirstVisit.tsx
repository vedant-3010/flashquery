import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StartOptions } from '@/features/home/StartOptions'
import { useUiStore } from '@/stores/ui'

/** Home before any project exists (F-HOME-03, F-SHELL-02): what flashQuery is and how to start. */
export function FirstVisit() {
  const openHowItWorks = useUiStore((state) => state.setHowItWorksOpen)
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
      <div className="grid max-w-md gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ask your data anything</h1>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
          Your files never leave this browser. Queries run on your device.
        </p>
      </div>
      <StartOptions variant="hero" />
      <p className="max-w-md text-xs text-muted-foreground">
        No key? Demo mode answers a set of questions about the sample data.{' '}
        <Button
          variant="link"
          size="xs"
          className="h-auto p-0"
          onClick={() => openHowItWorks(true)}
        >
          How it works
        </Button>
      </p>
    </div>
  )
}
