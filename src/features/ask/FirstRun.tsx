import { ClipboardPaste, KeyRound, MessageSquareText } from 'lucide-react'
import { useRef } from 'react'
import { PrivacyLine } from '@/components/PrivacyLine'
import { StartCards, type StartChoice } from '@/components/StartCards'
import { Button } from '@/components/ui/button'
import { ACCEPTED_EXTENSIONS } from '@/engine/ingest'
import { SAMPLES } from '@/engine/samples'
import { useDatasetsStore } from '@/stores/datasets'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

/** A project before any data is loaded (F-SHELL-02, D117): your file or a sample, in one place. */
export function FirstRun() {
  const loadSample = useDatasetsStore((state) => state.loadSample)
  const addFiles = useDatasetsStore((state) => state.addFiles)
  const loadingTable = useDatasetsStore(
    (state) => state.jobs.find((job) => job.status !== 'error')?.table ?? null,
  )
  const hasKey = useSettingsStore((state) => activeApiKey(state) !== null)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const openHowItWorks = useUiStore((state) => state.setHowItWorksOpen)
  const setPasteText = useUiStore((state) => state.setPasteText)
  // A question asked from Home before this project had data; the ask box takes it once data loads.
  const waiting = useUiStore((state) => state.draftQuestion)
  const files = useRef<HTMLInputElement>(null)

  const busy: StartChoice | null =
    loadingTable === null
      ? null
      : (SAMPLES.find((sample) => sample.table === loadingTable)?.id ?? 'upload')

  const choose = (choice: StartChoice) => {
    if (choice === 'upload') files.current?.click()
    else loadSample(choice)
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-4 text-center sm:p-6">
      <input
        ref={files}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        data-testid="start-file-input"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <div className="grid max-w-xl gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          What do you want to look at?
        </h1>
        <PrivacyLine>
          Your files stay on this device. Only what your privacy setting allows goes to the AI.
        </PrivacyLine>
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
      <StartCards onChoose={choose} busy={busy} className="max-w-3xl" />
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-muted-foreground"
          onClick={() => setPasteText('')}
        >
          <ClipboardPaste aria-hidden />
          Paste from a spreadsheet
        </Button>
        {!hasKey && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-muted-foreground"
            onClick={() => openSettings(true)}
          >
            <KeyRound aria-hidden />
            Add an AI key
          </Button>
        )}
      </div>
      <p className="max-w-md text-xs text-pretty text-muted-foreground">
        No AI key? Demo mode answers example questions about the samples.{' '}
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
