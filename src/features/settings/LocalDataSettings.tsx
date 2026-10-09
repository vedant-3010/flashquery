import { Download, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { KeepFilesSetting } from '@/features/settings/KeepFilesSetting'
import { downloadBytes } from '@/lib/download'
import { toAppError } from '@/lib/errors'
import { toJsonl, useFeedbackStore } from '@/stores/feedback'
import { useToastStore } from '@/stores/toast'
import { clearLocalData, exportWorkspace, importWorkspace } from '@/stores/workspace'

/**
 * Kept files (F-DATA-12), workspace export/import (F-EXP-03), saved answers (eval cases and learned
 * examples, F-ASK-14/20) and "Clear all local data" (F-EXP-04).
 */
export function LocalDataSettings({ inProject = true }: { inProject?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState<'everything' | 'cases' | null>(null)
  const toast = useToastStore((state) => state.show)
  const cases = useFeedbackStore((state) => state.cases)
  const clearCases = useFeedbackStore((state) => state.clearCases)

  const download = (snapshots: boolean) => {
    const file = exportWorkspace({ snapshots })
    downloadBytes(new TextEncoder().encode(file.json), file.fileName, 'application/json')
    toast(`Exported ${file.fileName}.`)
  }

  const downloadCases = () => {
    const fileName = `flashQuery-eval-cases-${new Date().toISOString().slice(0, 10)}.jsonl`
    downloadBytes(new TextEncoder().encode(toJsonl(cases)), fileName, 'application/jsonl')
    toast(`Exported ${fileName}.`)
  }

  const load = (file: File) =>
    file
      .text()
      .then((text) => {
        const added = importWorkspace(text)
        toast(
          `Imported ${added.dashboards} dashboards, ${added.history} history entries and notes for ${added.notes} datasets.`,
        )
      })
      .catch((error: unknown) => toast(`Couldn't import: ${toAppError(error).message}`))

  return (
    <div className="grid gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Settings, projects (history, dashboards, notes) and eval cases are saved in this browser
        only. Files are saved only if you choose to keep them.
      </p>
      <KeepFilesSetting />
      {!inProject && (
        <p className="text-xs text-muted-foreground">
          Open a project to export its workspace, or import one into a new project from Home.
        </p>
      )}
      {inProject && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => download(false)}>
            <Download aria-hidden />
            Export workspace
          </Button>
          <Button size="sm" variant="outline" onClick={() => download(true)}>
            <Download aria-hidden />
            Export with dashboard data
          </Button>
          <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
            <Upload aria-hidden />
            Import workspace…
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="workspace-import"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void load(file)
            }}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={cases.length === 0} onClick={downloadCases}>
          <Download aria-hidden />
          Export eval cases ({cases.length})
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={cases.length === 0}
          onClick={() => setConfirming('cases')}
        >
          <Trash2 aria-hidden />
          Delete saved answers…
        </Button>
        <span className="text-xs text-muted-foreground">
          Saved from 👍/👎 on answers, in the evals/ JSON Lines format. In Balanced mode, 👍 answers
          and your corrected SQL also guide similar questions on the same data.
        </span>
      </div>
      <div>
        <Button size="sm" variant="destructive" onClick={() => setConfirming('everything')}>
          <Trash2 aria-hidden />
          Clear all local data…
        </Button>
      </div>
      <AlertDialog
        open={confirming === 'cases'}
        onOpenChange={(open) => setConfirming(open ? 'cases' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved answers?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the {cases.length} eval cases saved from 👍/👎, so they no longer guide
              new questions. Export them first to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                clearCases()
                toast('Deleted the saved answers.')
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirming === 'everything'}
        onOpenChange={(open) => setConfirming(open ? 'everything' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your settings (including a remembered API key), history, dashboards,
              notes and any kept files from this browser, then reloads flashQuery. Export your
              workspace first to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void clearLocalData()}>
              Clear everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
