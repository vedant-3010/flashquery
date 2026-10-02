import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useDatasetsStore } from '@/stores/datasets'
import { useEngineStore, type EngineStatus, type PythonStatus } from '@/stores/engine'
import { restartEngine } from '@/stores/engineRestart'

const STATUS: Record<EngineStatus, { label: string; dot: string }> = {
  idle: { label: 'Engine idle', dot: 'bg-muted-foreground' },
  loading: {
    label: 'Engine loading',
    dot: 'bg-amber-500 animate-pulse motion-reduce:animate-none',
  },
  ready: { label: 'Engine ready', dot: 'bg-emerald-500' },
  error: { label: 'Engine error', dot: 'bg-destructive' },
}

const PYTHON: Record<PythonStatus, string> = {
  'not-loaded': 'Not loaded (loads on first Python analysis)',
  loading: 'Loading…',
  ready: 'Ready',
  error: 'Failed to load',
}

/** Engine status in the top bar; the popover explains it and offers "Restart engine" (F-SHELL-03). */
export function EngineStatusBadge() {
  const { status, version, error, python } = useEngineStore()
  const restarting = useDatasetsStore((state) => state.restarting)
  const [showDetails, setShowDetails] = useState(false)
  const { label, dot } = STATUS[status]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 items-center gap-1.5 rounded-4xl border px-2 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className={cn('size-1.5 rounded-full', dot)} aria-hidden />
          <span aria-live="polite">{restarting ? 'Engine restarting' : label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">SQL engine</dt>
          <dd>
            DuckDB {version ?? ''} · {label.replace('Engine ', '')}
          </dd>
          <dt className="text-muted-foreground">Python</dt>
          <dd>{PYTHON[python]}</dd>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          Both run inside this browser tab. Your data is never uploaded.
        </p>
        {status === 'error' && error && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <p className="text-xs">{error.message}</p>
            {showDetails && error.detail && (
              <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
                {error.detail}
              </pre>
            )}
            <div className="flex gap-2">
              <Button size="sm" disabled={restarting} onClick={() => void restartEngine()}>
                <RotateCcw aria-hidden />
                Restart engine
              </Button>
              {error.detail && (
                <Button size="sm" variant="ghost" onClick={() => setShowDetails(!showDetails)}>
                  {showDetails ? 'Hide details' : 'Show details'}
                </Button>
              )}
            </div>
          </div>
        )}
        {status === 'ready' && (
          <div className="mt-3 flex items-center gap-2 border-t pt-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              Slow or stuck? A restart reloads your files and restores answers.
            </p>
            <Button
              size="xs"
              variant="outline"
              disabled={restarting}
              onClick={() => void restartEngine()}
            >
              <RotateCcw aria-hidden />
              Restart engine
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
