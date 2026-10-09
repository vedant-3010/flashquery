import { FlaskConical, KeyRound, Loader2, MessageSquareText, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UploadButton } from '@/features/datasets/UploadButton'
import { useDatasetsStore } from '@/stores/datasets'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

/** The landing state before any data is loaded (F-SHELL-02). */
export function FirstRun() {
  const loadSample = useDatasetsStore((state) => state.loadSample)
  const loading = useDatasetsStore((state) => state.jobs.some((job) => job.status !== 'error'))
  const hasKey = useSettingsStore((state) => activeApiKey(state) !== null)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const openHowItWorks = useUiStore((state) => state.setHowItWorksOpen)
  // A question asked from Home before this project had data; the ask box takes it once data loads.
  const waiting = useUiStore((state) => state.draftQuestion)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="grid max-w-md gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ask your data anything</h1>
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
          Your files never leave this browser. Queries run on your device.
        </p>
      </div>
      {waiting && (
        <p className="flex max-w-md items-start gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Load data to ask <span className="font-medium">“{waiting}”</span>: it waits in the ask
            box.
          </span>
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button disabled={loading} onClick={() => loadSample('global-sales-1m')}>
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <FlaskConical aria-hidden />
          )}
          {loading ? 'Loading…' : 'Try sample data (1M rows)'}
        </Button>
        <UploadButton />
        {!hasKey && (
          <Button variant="outline" size="sm" onClick={() => openSettings(true)}>
            <KeyRound aria-hidden />
            Add API key
          </Button>
        )}
      </div>
      <p className="max-w-md text-xs text-muted-foreground">
        No key? Demo mode answers a set of questions about the sample data.{' '}
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
