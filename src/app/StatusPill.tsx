import { CircleHelp, Cloud, CloudOff, Lock, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import type { PrivacyMode } from '@/ai/schemas'
import { PrivacyModeSchema } from '@/ai/schemas'
import { EngineMemory } from '@/app/EngineMemory'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PRIVACY_MODES } from '@/features/settings/privacyText'
import { cn } from '@/lib/utils'
import { useDatasetsStore } from '@/stores/datasets'
import { useEngineStore, type EngineStatus, type PythonStatus } from '@/stores/engine'
import { restartEngine } from '@/stores/engineRestart'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore, type SyncStatus } from '@/stores/sync'
import { useUiStore } from '@/stores/ui'

const MODE_LABEL: Record<PrivacyMode, string> = { strict: 'Strict', balanced: 'Balanced' }

const ENGINE: Record<EngineStatus, { label: string; dot: string }> = {
  idle: { label: 'Engine idle', dot: 'bg-muted-foreground' },
  loading: {
    label: 'Engine loading',
    dot: 'bg-amber-500 animate-pulse motion-reduce:animate-none',
  },
  ready: { label: 'Engine ready', dot: 'bg-emerald-500' },
  error: { label: 'Engine error', dot: 'bg-destructive' },
}

/** The encrypted workspace in the pill (M17): only once there's one to report on. */
const SYNC: Partial<Record<SyncStatus, { label: string; detail: string }>> = {
  ready: { label: 'saved to your account', detail: 'Encrypted and saved to your account.' },
  syncing: { label: 'saving to your account', detail: 'Saving to your account…' },
  error: {
    label: 'not saved to your account',
    detail: 'Couldn’t save to your account. Changes stay here and save when it’s back.',
  },
  locked: {
    label: 'account locked',
    detail: 'Locked on this device: unlock to save and see your other projects.',
  },
}

const PYTHON: Record<PythonStatus, string> = {
  'not-loaded': 'Not loaded (loads on first Python analysis)',
  loading: 'Loading…',
  ready: 'Ready',
  error: 'Failed to load',
}

/**
 * The top bar's one status control (D118, after Linear's quiet bars): the privacy mode and the
 * engine's state in one pill. Its popover switches the mode (F-AI-02), shows the engine, its memory
 * (F-PERF-05) and "Restart engine" (F-SHELL-03). Home leaves the engine out (`engine={false}`).
 */
export function StatusPill({ engine: withEngine = true }: { engine?: boolean }) {
  const mode = useSettingsStore((state) => state.privacyMode)
  const setPrivacyMode = useSettingsStore((state) => state.setPrivacyMode)
  const setHowItWorksOpen = useUiStore((state) => state.setHowItWorksOpen)
  const { status, version, error, python } = useEngineStore()
  const restarting = useDatasetsStore((state) => state.restarting)
  const syncStatus = useSyncStore((state) => state.status)
  const openSync = useSyncStore((state) => state.openDialog)
  const sync = SYNC[syncStatus]
  const [showDetails, setShowDetails] = useState(false)
  const engine = restarting
    ? { label: 'Engine restarting', dot: ENGINE.loading.dot }
    : ENGINE[status]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${MODE_LABEL[mode]}${sync ? `, ${sync.label}` : ''}${withEngine ? `, ${engine.label.toLowerCase()}` : ''}`}
          className="inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="max-lg:sr-only">Privacy: </span>
          {MODE_LABEL[mode]}
          {sync && (
            <span title={sync.detail} className="text-muted-foreground [&>svg]:size-3.5">
              {syncStatus === 'error' ? (
                <CloudOff className="text-destructive" aria-hidden />
              ) : syncStatus === 'locked' ? (
                <Lock aria-hidden />
              ) : (
                <Cloud
                  aria-hidden
                  className={cn(
                    syncStatus === 'syncing' && 'animate-pulse motion-reduce:animate-none',
                  )}
                />
              )}
            </span>
          )}
          {withEngine && (
            <span
              className={cn('ml-0.5 size-1.5 rounded-full', engine.dot)}
              aria-hidden
              title={engine.label}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 text-sm">
        <section aria-labelledby="status-privacy" className="grid gap-2 p-3">
          <h3 id="status-privacy" className="text-xs font-medium text-muted-foreground">
            What the AI may see
          </h3>
          <RadioGroup
            value={mode}
            onValueChange={(value) => setPrivacyMode(PrivacyModeSchema.parse(value))}
            className="grid gap-1.5"
          >
            {PrivacyModeSchema.options.map((option) => (
              <div
                key={option}
                className="flex items-start gap-2 rounded-md p-1.5 hover:bg-muted/60"
              >
                <RadioGroupItem value={option} id={`status-${option}`} className="mt-0.5" />
                <Label htmlFor={`status-${option}`} className="grid gap-0.5 font-normal">
                  <span className="text-sm font-medium">{PRIVACY_MODES[option].label}</span>
                  <span className="text-xs text-muted-foreground">
                    {PRIVACY_MODES[option].summary}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </section>
        {sync && (
          <section aria-labelledby="status-sync" className="grid gap-2 border-t p-3">
            <h3 id="status-sync" className="text-xs font-medium text-muted-foreground">
              Your workspace
            </h3>
            <p className="text-xs">{sync.detail}</p>
            {syncStatus === 'locked' ? (
              <Button size="xs" className="w-fit" onClick={() => openSync('unlock')}>
                Unlock
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Encrypted on this device first: we can’t read it.
              </p>
            )}
          </section>
        )}
        {withEngine && (
          <section aria-labelledby="status-engine" className="grid gap-2 border-t p-3">
            <h3
              id="status-engine"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <span className={cn('size-1.5 rounded-full', engine.dot)} aria-hidden />
              {engine.label}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">SQL engine</dt>
              <dd>
                DuckDB {version ?? ''} · {ENGINE[status].label.replace('Engine ', '')}
              </dd>
              <dt className="text-muted-foreground">Python</dt>
              <dd>{PYTHON[python]}</dd>
              {status === 'ready' && <EngineMemory />}
            </dl>
            <p className="text-xs text-muted-foreground">
              Both run inside this browser tab: your rows are analysed here, never on a server.
            </p>
            {status === 'error' && error && (
              <div className="grid gap-2">
                <p className="text-xs">{error.message}</p>
                {showDetails && error.detail && (
                  <pre className="max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-[11px] whitespace-pre-wrap">
                    {error.detail}
                  </pre>
                )}
                {error.detail && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="w-fit"
                    onClick={() => setShowDetails(!showDetails)}
                  >
                    {showDetails ? 'Hide details' : 'Show details'}
                  </Button>
                )}
              </div>
            )}
            {(status === 'ready' || status === 'error') && (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {status === 'error'
                    ? 'Restart to try again.'
                    : 'Slow or stuck? A restart reloads your files and restores answers.'}
                </p>
                <Button
                  size="xs"
                  variant={status === 'error' ? 'default' : 'outline'}
                  disabled={restarting}
                  onClick={() => void restartEngine()}
                >
                  <RotateCcw aria-hidden />
                  Restart engine
                </Button>
              </div>
            )}
          </section>
        )}
        <div className="border-t p-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setHowItWorksOpen(true)}
          >
            <CircleHelp aria-hidden />
            How HushGlance handles your data
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
