import { Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useCommands, type Command } from '@/app/useCommands'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { searchCommands } from '@/lib/commandSearch'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'

const MAX_RESULTS = 60

function Palette({ onDone }: { onDone: () => void }) {
  const commands = useCommands()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const results = useMemo(
    () => searchCommands(commands, query).slice(0, MAX_RESULTS),
    [commands, query],
  )
  const current = Math.min(active, Math.max(0, results.length - 1))

  const run = (command: Command | undefined) => {
    if (!command) return
    onDone()
    // After the dialog closes, so focus and any dialog the command opens behave.
    requestAnimationFrame(() => command.run())
  }

  const move = (by: number) => {
    if (results.length === 0) return
    const next = (current + by + results.length) % results.length
    setActive(next)
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="grid">
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results.length > 0 ? `${listId}-${current}` : undefined}
          aria-label="Search commands"
          placeholder="Type a command, question, dataset or dashboard…"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') move(1)
            else if (event.key === 'ArrowUp') move(-1)
            else if (event.key === 'Enter') run(results[current])
            else return
            event.preventDefault()
          }}
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-1">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</li>
        )}
        {results.map((command, index) => (
          <li
            key={command.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === current}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
              index === current && 'bg-muted',
            )}
            onMouseMove={() => setActive(index)}
            onClick={() => run(command)}
          >
            <span className="min-w-0 flex-1 truncate">{command.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{command.group}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ctrl/Cmd+K (F-SHELL-07): go anywhere, ask a recent question, open a dataset or dashboard. */
export function CommandPalette() {
  const open = useUiStore((state) => state.commandPaletteOpen)
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        {open && <Palette onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
