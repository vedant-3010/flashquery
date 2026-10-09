import { ScanEye, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const STEPS = [
  {
    title: 'Your file loads into your browser',
    text: 'DuckDB, a full SQL database, runs in this tab. Nothing is uploaded to a server; flashQuery has none.',
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

const MODES = [
  {
    mode: 'strict',
    name: 'Strict',
    sent: 'Table and column names, types, row counts and your notes. No values, no results.',
  },
  {
    mode: 'balanced',
    name: 'Balanced',
    sent: 'Strict, plus per-column statistics, up to 5 common values, 3 sample rows (text cut to 40 characters), up to 3 of your 👍 answers on the same data as examples, and the result (≤ 50 rows, or a digest) for the AI summary.',
  },
] as const

/**
 * A plain-language tour of the privacy model (F-SHELL-02, F-SHIP-04), from the first-run screen and
 * the top bar; links to the AI inspector, where every request is shown as sent (inside a project:
 * `inspector`).
 */
export function HowItWorksDialog({ inspector = true }: { inspector?: boolean }) {
  const open = useUiStore((state) => state.howItWorksOpen)
  const setOpen = useUiStore((state) => state.setHowItWorksOpen)
  const setSidePanelOpen = useUiStore((state) => state.setSidePanelOpen)
  const setSidePanelTab = useUiStore((state) => state.setSidePanelTab)
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen)
  const mode = useSettingsStore((state) => state.privacyMode)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How flashQuery works</DialogTitle>
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
        <table className="w-full text-left text-xs">
          <caption className="pb-1 text-left text-sm font-medium">
            What the AI receives in each privacy mode
          </caption>
          <tbody>
            {MODES.map((row) => (
              <tr key={row.mode} className="border-t align-top">
                <th scope="row" className="py-1.5 pr-3 font-medium whitespace-nowrap">
                  {row.name}
                  {row.mode === mode && (
                    <span className="block font-normal text-muted-foreground">(yours)</span>
                  )}
                </th>
                <td className="py-1.5 text-muted-foreground">{row.sent}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          {demo
            ? 'Demo mode sends nothing: its answers are pre-recorded and the SQL runs on your device.'
            : 'Requests go straight from your browser to the AI provider with your key. Your rows and files stay here.'}{' '}
          Voice questions are recognized on this device; no audio leaves it.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false)
              setSettingsOpen(true)
            }}
          >
            <Settings aria-hidden />
            Privacy settings
          </Button>
          {inspector && (
            <Button
              onClick={() => {
                setOpen(false)
                setSidePanelTab('inspector')
                setSidePanelOpen(true)
              }}
            >
              <ScanEye aria-hidden />
              Open the AI inspector
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
