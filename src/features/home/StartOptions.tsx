import { FileJson, KeyRound } from 'lucide-react'
import { useRef } from 'react'
import { tryDemoFor } from '@/app/tryDemo'
import { StartCards, type StartChoice } from '@/components/StartCards'
import { Button } from '@/components/ui/button'
import { ACCEPTED_EXTENSIONS } from '@/engine/ingest'
import { useStartProject } from '@/features/home/useStartProject'
import { toAppError } from '@/lib/errors'
import { useProjectsStore } from '@/stores/projects'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

/** "sales_2025.csv" → "sales_2025". */
const baseName = (fileName: string) => fileName.replace(/\.[^.]+$/, '') || fileName

/**
 * Ways to start (F-HOME-03, D117): your file into a new project, or a sample in its own sample
 * project (the one its try link opens); a saved workspace file below.
 */
export function StartOptions({ variant }: { variant: 'hero' | 'tiles' }) {
  const start = useStartProject()
  const files = useRef<HTMLInputElement>(null)
  const workspace = useRef<HTMLInputElement>(null)
  const hasKey = useSettingsStore((state) => activeApiKey(state) !== null)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const toast = useToastStore((state) => state.show)

  const choose = (choice: StartChoice) => {
    if (choice === 'upload') {
      files.current?.click()
      return
    }
    const demo = tryDemoFor(choice)
    const existing = useProjectsStore.getState().projects.find((p) => p.id === demo.projectId)
    void start(
      { kind: 'sample', sampleId: choice },
      existing ? { projectId: existing.id } : { name: demo.projectName, newId: demo.projectId },
    )
  }
  const upload = (picked: File[]) => {
    const first = picked[0]
    if (first) void start({ kind: 'files', files: picked }, { name: baseName(first.name) })
  }
  const importFile = (file: File) =>
    file
      .text()
      .then((text) => start({ kind: 'import', text }, { name: 'Imported workspace' }))
      .catch((error: unknown) => toast(`Couldn't read ${file.name}: ${toAppError(error).message}`))

  const inputs = (
    <>
      <input
        ref={files}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        data-testid="home-file-input"
        onChange={(event) => {
          upload(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <input
        ref={workspace}
        type="file"
        accept=".json,application/json"
        className="hidden"
        data-testid="home-workspace-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importFile(file)
        }}
      />
    </>
  )

  const more = (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-muted-foreground"
        onClick={() => workspace.current?.click()}
      >
        <FileJson aria-hidden />
        Open a saved workspace file
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
  )

  if (variant === 'hero') {
    return (
      <div className="grid w-full max-w-3xl justify-items-center gap-4">
        {inputs}
        <StartCards onChoose={choose} />
        {more}
      </div>
    )
  }

  return (
    <section aria-labelledby="home-start" className="grid gap-3">
      {inputs}
      <h2 id="home-start" className="text-sm font-medium">
        Start something new
      </h2>
      <StartCards onChoose={choose} />
      <div className="flex justify-start">{more}</div>
    </section>
  )
}
