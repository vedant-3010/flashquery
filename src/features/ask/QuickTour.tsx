import { X } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'

const STEPS = [
  {
    title: 'Ask in plain English',
    text: 'Type a question below or pick a suggestion. The AI writes SQL, and DuckDB runs it here in your browser.',
  },
  {
    title: 'Check every answer',
    text: "Each answer shows its SQL (you can edit and re-run it), its assumptions and a trace. The side panel's AI inspector shows exactly what was sent to the AI.",
  },
  {
    title: 'Build a dashboard',
    text: 'Pin answers, or let the AI generate a dashboard in the Dashboard tab. Everything is saved on this device only.',
  },
]

/**
 * The first-run tour (F-SHELL-05): three steps, inline above the answers (it never covers the
 * page), dismissible at any point and remembered.
 */
export function QuickTour() {
  const done = useSettingsStore((state) => state.tourDone)
  const hydrated = useSettingsStore((state) => state.hydrated)
  const setDone = useSettingsStore((state) => state.setTourDone)
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  if (done || !hydrated || !current) return null
  const last = step === STEPS.length - 1

  return (
    <section
      aria-label="Quick tour"
      className="grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="text-xs text-muted-foreground">
            Quick tour · {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-sm font-semibold">{current.title}</h2>
          <p className="text-sm text-muted-foreground">{current.text}</p>
        </div>
        <IconButton label="Skip the tour" size="icon-xs" onClick={() => setDone(true)}>
          <X />
        </IconButton>
      </div>
      <div className="flex gap-2">
        {step > 0 && (
          <Button size="xs" variant="ghost" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Button size="xs" onClick={() => (last ? setDone(true) : setStep(step + 1))}>
          {last ? 'Got it' : 'Next'}
        </Button>
      </div>
    </section>
  )
}
