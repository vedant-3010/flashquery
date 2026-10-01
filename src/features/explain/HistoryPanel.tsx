import { History, MessageSquareText, Pin, Play, SquareTerminal, Trash2, X } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { IconButton } from '@/components/IconButton'
import { Button } from '@/components/ui/button'
import { toAppError } from '@/lib/errors'
import { formatEventTime, formatNumber } from '@/lib/format'
import { useAskStore } from '@/stores/ask'
import { pinQuery } from '@/stores/dashboardJobs'
import { useHistoryStore, type HistoryEntry } from '@/stores/history'
import { useSettingsStore } from '@/stores/settings'
import { useSqlStore } from '@/stores/sql'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

const STATUS: Record<HistoryEntry['status'], string> = {
  answered: 'Answered',
  'no-sql': 'No SQL',
  failed: 'Failed',
}

/** Every question and query, persisted on this device (F-EXPL-05). */
export function HistoryPanel() {
  const entries = useHistoryStore((state) => state.entries)
  const remove = useHistoryStore((state) => state.remove)
  const clear = useHistoryStore((state) => state.clear)
  const locale = useSettingsStore((state) => state.locale)
  const ask = useAskStore((state) => state.ask)
  const setView = useUiStore((state) => state.setView)
  const toast = useToastStore((state) => state.show)

  const pin = (entry: HistoryEntry) => {
    if (!entry.sql) return
    pinQuery({ title: entry.kind === 'question' ? entry.text : 'Query', sql: entry.sql }).catch(
      (error: unknown) => toast(`Couldn't pin: ${toAppError(error).message}`),
    )
  }

  const rerun = (entry: HistoryEntry) => {
    if (entry.kind === 'question') {
      setView('workspace')
      void ask(entry.text)
    } else {
      setView('sql')
      useSqlStore.getState().setText(entry.text)
      void useSqlStore.getState().run()
    }
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No history yet"
        description="Questions and queries you run are listed here, on this device only."
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>Saved on this device. No result rows are stored.</span>
        <Button size="xs" variant="ghost" className="ml-auto" onClick={clear}>
          <Trash2 aria-hidden />
          Clear all
        </Button>
      </div>
      <ol aria-label="History" className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry) => {
          const Icon = entry.kind === 'question' ? MessageSquareText : SquareTerminal
          return (
            <li key={entry.id} className="group flex items-start gap-2 border-b px-3 py-2 text-xs">
              <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className={entry.kind === 'query' ? 'truncate font-mono' : 'line-clamp-2'}>
                  {entry.text}
                </p>
                <p className="truncate text-muted-foreground">
                  {formatEventTime(entry.at, locale)} · {STATUS[entry.status]}
                  {entry.rowCount !== null &&
                    ` · ${formatNumber(entry.rowCount, locale)} ${entry.rowCount === 1 ? 'row' : 'rows'}`}
                  {entry.headline && ` · ${entry.headline}`}
                </p>
              </div>
              {entry.sql && entry.status === 'answered' && (
                <IconButton label="Pin to dashboard" size="icon-xs" onClick={() => pin(entry)}>
                  <Pin />
                </IconButton>
              )}
              <IconButton
                label={entry.kind === 'question' ? 'Ask again' : 'Run again'}
                size="icon-xs"
                onClick={() => rerun(entry)}
              >
                <Play />
              </IconButton>
              <IconButton
                label="Delete from history"
                size="icon-xs"
                onClick={() => remove(entry.id)}
              >
                <X />
              </IconButton>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
