import { FileJson, FlaskConical, KeyRound, Upload, type LucideIcon } from 'lucide-react'
import { useRef } from 'react'
import { TRY_PROJECT_ID, TRY_PROJECT_NAME } from '@/app/tryDemo'
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
 * Ways to start (F-HOME-03): upload files into a new project, the 1M-row sample (in the "Sample:
 * Global Sales" project, as the try link), or a workspace file imported into a new project.
 */
export function StartOptions({ variant }: { variant: 'hero' | 'tiles' }) {
  const start = useStartProject()
  const files = useRef<HTMLInputElement>(null)
  const workspace = useRef<HTMLInputElement>(null)
  const hasKey = useSettingsStore((state) => activeApiKey(state) !== null)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const toast = useToastStore((state) => state.show)

  const sample = () => {
    const existing = useProjectsStore.getState().projects.find((p) => p.id === TRY_PROJECT_ID)
    void start(
      { kind: 'sample', sampleId: 'global-sales-1m' },
      existing ? { projectId: existing.id } : { name: TRY_PROJECT_NAME, newId: TRY_PROJECT_ID },
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

  if (variant === 'hero') {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        {inputs}
        <Button onClick={sample}>
          <FlaskConical aria-hidden />
          Try sample data (1M rows)
        </Button>
        <Button variant="outline" size="sm" onClick={() => files.current?.click()}>
          <Upload aria-hidden />
          Upload files
        </Button>
        <Button variant="outline" size="sm" onClick={() => workspace.current?.click()}>
          <FileJson aria-hidden />
          Import a workspace
        </Button>
        {!hasKey && (
          <Button variant="outline" size="sm" onClick={() => openSettings(true)}>
            <KeyRound aria-hidden />
            Add API key
          </Button>
        )}
      </div>
    )
  }

  return (
    <section aria-labelledby="home-start" className="grid gap-3">
      {inputs}
      <h2 id="home-start" className="text-sm font-medium">
        Start something new
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <StartTile
          icon={Upload}
          title="Upload files"
          description="CSV, Excel, Parquet or JSON, read in this browser."
          onClick={() => files.current?.click()}
        />
        <StartTile
          icon={FlaskConical}
          title="Try the 1M-row sample"
          description="Global Sales orders, generated on your device."
          onClick={sample}
        />
        <StartTile
          icon={FileJson}
          title="Import a workspace"
          description="History, dashboards and notes from an exported file."
          onClick={() => workspace.current?.click()}
        />
      </div>
    </section>
  )
}

function StartTile({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid gap-1 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Icon className="size-5 text-primary" aria-hidden />
      <span className="mt-1 text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  )
}
