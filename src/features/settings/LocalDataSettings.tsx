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
import { downloadBytes } from '@/lib/download'
import { toAppError } from '@/lib/errors'
import { toJsonl, useFeedbackStore } from '@/stores/feedback'
import { useToastStore } from '@/stores/toast'
import { clearLocalData, exportWorkspace, importWorkspace } from '@/stores/workspace'

/** Workspace export/import (F-EXP-03) and "Clear all local data" (F-EXP-04). */
export function LocalDataSettings() {
  const input = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)
  const toast = useToastStore((state) => state.show)
  const cases = useFeedbackStore((state) => state.cases)

  const download = (snapshots: boolean) => {
    const file = exportWorkspace({ snapshots })
    downloadBytes(new TextEncoder().encode(file.json), file.fileName, 'application/json')
    toast(`Exported ${file.fileName}.`)
  }

  const downloadCases = () => {
    const fileName = `askdata-eval-cases-${new Date().toISOString().slice(0, 10)}.jsonl`
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
        Settings, history, dashboards, notes and eval cases are saved in this browser only. Your
        files are never saved; load them again after a reload.
      </p>
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
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={cases.length === 0} onClick={downloadCases}>
          <Download aria-hidden />
          Export eval cases ({cases.length})
        </Button>
        <span className="text-xs text-muted-foreground">
          Saved from 👍/👎 on answers, in the evals/ JSON Lines format.
        </span>
      </div>
      <div>
        <Button size="sm" variant="destructive" onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden />
          Clear all local data…
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your settings (including a remembered API key), history, dashboards and
              notes from this browser, then reloads AskData. Export your workspace first to keep a
              copy.
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
