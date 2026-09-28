import { ChevronRight, ClipboardCopy, ScanEye, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AiLogEntry } from '@/ai/log'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDuration, formatEventTime, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAiLogStore } from '@/stores/aiLog'
import { activeApiKey, useSettingsStore } from '@/stores/settings'

const PURPOSES: Record<AiLogEntry['purpose'], string> = {
  plan: 'Write SQL',
  repair: 'Fix SQL',
  test: 'Test connection',
}

function Entry({ entry }: { entry: AiLogEntry }) {
  const locale = useSettingsStore((state) => state.locale)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const usage = entry.usage

  return (
    <li className="min-w-0 rounded-md border text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-1 gap-1 p-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex items-center gap-1.5">
          <ChevronRight
            className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
            aria-hidden
          />
          <span className="font-medium">{PURPOSES[entry.purpose]}</span>
          <span className="text-muted-foreground">{formatEventTime(entry.at, locale)}</span>
          {entry.error && <Badge variant="destructive">Error</Badge>}
          <span className="ml-auto text-muted-foreground tabular-nums">
            {formatDuration(entry.ms, locale)}
          </span>
        </span>
        <span className="flex flex-wrap gap-x-2 pl-5 text-muted-foreground">
          <span className="font-mono">{entry.model}</span>
          <span>{entry.mode === 'strict' ? 'Strict' : 'Balanced'}</span>
          <span className={cn(entry.dataValues === 0 && 'text-emerald-700 dark:text-emerald-400')}>
            {formatNumber(entry.dataValues, locale)} data{' '}
            {entry.dataValues === 1 ? 'value' : 'values'} sent
          </span>
          {usage && (
            <span className="tabular-nums">
              {formatNumber(usage.inputTokens, locale)} in ·{' '}
              {formatNumber(usage.outputTokens, locale)} out
              {usage.cacheReadTokens > 0 &&
                ` · ${formatNumber(usage.cacheReadTokens, locale)} cached`}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 border-t p-2">
          <Button
            size="xs"
            variant="outline"
            className="w-fit"
            onClick={() => {
              navigator.clipboard
                .writeText(JSON.stringify(entry, null, 2))
                .then(() => setCopied(true))
                .catch((error: unknown) => console.warn('AskData: copy failed', error))
            }}
          >
            <ClipboardCopy aria-hidden />
            {copied ? 'Copied' : 'Copy as JSON'}
          </Button>
          {entry.messages.map((message, index) => (
            <section key={index} aria-label={`Message ${index + 1}: ${message.role}`}>
              <p className="mb-0.5 font-medium text-muted-foreground uppercase">{message.role}</p>
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono break-words whitespace-pre-wrap">
                {message.content}
              </pre>
            </section>
          ))}
          <section aria-label="Response">
            <p className="mb-0.5 font-medium text-muted-foreground uppercase">
              {entry.error ? 'Error' : 'Parsed output'}
            </p>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono break-words whitespace-pre-wrap">
              {entry.error ?? JSON.stringify(entry.output, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </li>
  )
}

/** "What the AI saw" (F-EXPL-04): every request this session, exactly as sent. */
export function AiInspector() {
  const entries = useAiLogStore((state) => state.entries)
  const clear = useAiLogStore((state) => state.clear)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ScanEye}
        title="No AI requests yet"
        description={
          demo
            ? 'Demo mode sends nothing: answers are pre-recorded. With a key, every request appears here exactly as sent.'
            : 'Every request sent to the AI provider appears here exactly as sent, with its response.'
        }
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span>This session only. Keys are never shown.</span>
        <Button size="xs" variant="ghost" className="ml-auto" onClick={clear}>
          <Trash2 aria-hidden />
          Clear
        </Button>
      </div>
      <ol
        aria-label="AI requests"
        className="grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto p-2"
      >
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </ol>
    </div>
  )
}
