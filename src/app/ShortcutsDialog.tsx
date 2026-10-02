import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUiStore } from '@/stores/ui'

const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['/'], action: 'Focus the ask box' },
  { keys: ['Enter'], action: 'Ask the question' },
  { keys: ['Shift', 'Enter'], action: 'New line in the question' },
  { keys: ['Esc'], action: 'Cancel a running question, or close a dialog or menu' },
  { keys: [MOD, 'Enter'], action: 'Run the SQL editor, or the Python code' },
  { keys: ['Tab'], action: 'Move between controls (editors never trap Tab)' },
  { keys: ['←', '→'], action: 'Switch tabs in a tab list' },
  { keys: ['Shift', 'Click'], action: 'Select a block of grid cells (arrows move, Shift extends)' },
  { keys: [MOD, 'C'], action: 'Copy the selected grid cells (tab-separated)' },
  { keys: [MOD, 'V'], action: 'Paste spreadsheet cells as a new table' },
  { keys: ['?'], action: 'Show this list' },
]

/** Every keyboard shortcut (F-SHELL-06), opened with `?`. */
export function ShortcutsDialog() {
  const open = useUiStore((state) => state.shortcutsOpen)
  const setOpen = useUiStore((state) => state.setShortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything in AskData also works from the keyboard.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(({ keys, action }) => (
            <div key={action} className="contents">
              <dt className="flex gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="text-muted-foreground">{action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
