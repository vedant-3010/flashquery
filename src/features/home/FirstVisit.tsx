import { PrivacyLine } from '@/components/PrivacyLine'
import { Button } from '@/components/ui/button'
import { StartOptions } from '@/features/home/StartOptions'
import { useUiStore } from '@/stores/ui'

/** Home before any project exists (F-HOME-03, F-SHELL-02): how to start, and the promise. */
export function FirstVisit() {
  const openHowItWorks = useUiStore((state) => state.setHowItWorksOpen)
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center sm:py-16">
      <div className="grid max-w-xl gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          What do you want to look at?
        </h1>
        <PrivacyLine>
          Open a spreadsheet or export, or try a sample. Your files stay on this device.
        </PrivacyLine>
      </div>
      <StartOptions variant="hero" />
      <p className="max-w-md text-xs text-pretty text-muted-foreground">
        No AI key? Demo mode answers example questions about the samples.{' '}
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
