import { CircleCheck, CircleX, LoaderCircle, Sparkles } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { GenerateProgress } from '@/ai/dashboard'
import { DEMO_TABLE } from '@/ai/fixtures'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isCancellation, toAppError } from '@/lib/errors'
import { generate } from '@/stores/dashboardJobs'
import { useDatasetsStore } from '@/stores/datasets'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

const ICONS = {
  pending: null,
  running: LoaderCircle,
  done: CircleCheck,
  error: CircleX,
} as const

/** "Generate dashboard" (F-DASH-09): the AI proposes tiles for a dataset; each one runs here. */
export function GenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const datasets = useDatasetsStore((state) => state.datasets)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)
  const mode = useSettingsStore((state) => state.privacyMode)
  const preferred = datasets.find((d) => d.table === DEMO_TABLE) ?? datasets[0]
  const [datasetId, setDatasetId] = useState<string | null>(null)
  const [focus, setFocus] = useState('')
  const [progress, setProgress] = useState<GenerateProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const datasetFieldId = useId()
  const focusId = useId()
  const chosen = datasetId ?? preferred?.id ?? ''
  const running = progress !== null && progress.stage !== 'done' && error === null

  const close = (next: boolean) => {
    if (!next) {
      controller.current?.abort()
      setProgress(null)
      setError(null)
    }
    onOpenChange(next)
  }

  const start = async () => {
    const current = new AbortController()
    controller.current = current
    setError(null)
    setProgress({ stage: 'planning', title: null, tiles: [] })
    try {
      const { failed } = await generate({
        datasetId: chosen,
        focus,
        signal: current.signal,
        onProgress: setProgress,
      })
      close(false)
      if (failed.length > 0) {
        useToastStore
          .getState()
          .show(
            `${failed.length} proposed ${failed.length === 1 ? 'tile' : 'tiles'} couldn't run and were left out.`,
          )
      }
    } catch (caught) {
      if (!isCancellation(caught)) setError(toAppError(caught).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate a dashboard</DialogTitle>
          <DialogDescription>
            {demo
              ? 'Demo mode builds the Global Sales dashboard from a recorded plan. The queries run on your device.'
              : `The AI proposes 4–8 tiles from what ${mode === 'strict' ? 'Strict' : 'Balanced'} mode lets it see. Every query is checked, then runs on your device.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={datasetFieldId}>Dataset</Label>
            <Select value={chosen} onValueChange={setDatasetId} disabled={running}>
              <SelectTrigger id={datasetFieldId} className="w-full">
                <SelectValue placeholder="Load a dataset first" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!demo && (
            <div className="grid gap-1.5">
              <Label htmlFor={focusId}>Focus (optional)</Label>
              <Input
                id={focusId}
                placeholder="e.g. margins and returns"
                value={focus}
                disabled={running}
                onChange={(event) => setFocus(event.target.value)}
              />
            </div>
          )}

          {progress && (
            <div aria-live="polite" className="grid gap-1 text-sm">
              <p className="font-medium">
                {progress.stage === 'planning'
                  ? 'Planning tiles…'
                  : (progress.title ?? 'Running tiles')}
              </p>
              <ol aria-label="Tiles" className="grid gap-1">
                {progress.tiles.map((tile) => {
                  const Icon = ICONS[tile.status]
                  return (
                    <li key={tile.title} className="flex items-center gap-2 text-xs">
                      {Icon ? (
                        <Icon
                          className={
                            tile.status === 'running'
                              ? 'size-3.5 animate-spin motion-reduce:animate-none'
                              : tile.status === 'error'
                                ? 'size-3.5 text-destructive'
                                : 'size-3.5 text-emerald-600 dark:text-emerald-400'
                          }
                          aria-hidden
                        />
                      ) : (
                        <span className="size-3.5" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">{tile.title}</span>
                      <span className="sr-only">{tile.status}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={() => void start()} disabled={running || !chosen}>
            <Sparkles aria-hidden />
            {running ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
