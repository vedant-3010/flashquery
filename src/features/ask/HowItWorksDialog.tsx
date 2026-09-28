import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUiStore } from '@/stores/ui'

const STEPS = [
  {
    title: 'Your file loads into your browser',
    text: 'DuckDB, a full SQL database, runs in this tab. Nothing is uploaded to a server; AskData has none.',
  },
  {
    title: 'The AI sees the shape of your data',
    text: "Table and column names, and, in Balanced mode, a few statistics and sample values plus the answer's result (up to 50 rows) for its summary. Strict mode sends no values at all.",
  },
  {
    title: 'The AI writes SQL; your browser runs it',
    text: 'Every query is checked first: read-only, one statement, only your tables. If it fails, the AI gets the error and tries again (twice at most).',
  },
  {
    title: 'You can check everything',
    text: 'Each answer shows its SQL (editable), assumptions and a step-by-step trace. The AI inspector shows every request exactly as it was sent.',
  },
]

/** A plain-language tour of the privacy model, from the first-run screen (F-SHELL-02). */
export function HowItWorksDialog() {
  const open = useUiStore((state) => state.howItWorksOpen)
  const setOpen = useUiStore((state) => state.setHowItWorksOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How AskData works</DialogTitle>
          <DialogDescription>
            Bring your own AI key; without one, demo mode answers questions about the sample data.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3 text-sm">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="grid gap-0.5">
                <p className="font-medium">{step.title}</p>
                <p className="text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}
