import { useId, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { formatNumber } from '@/lib/format'
import { looksLikeTable, tsvShape } from '@/lib/tsv'
import { addPastedData } from '@/stores/datasetEdits'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

function PasteForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const locale = useSettingsStore((state) => state.locale)
  const [text, setText] = useState(initial)
  const [name, setName] = useState('Pasted data')
  const id = useId()
  const shape = tsvShape(text)
  const valid = looksLikeTable(text)

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        addPastedData(text, name)
        onDone()
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-cells`}>Cells (tab-separated, header row first)</Label>
        <Textarea
          id={`${id}-cells`}
          rows={8}
          spellCheck={false}
          className="max-h-72 font-mono text-xs whitespace-pre"
          placeholder="Copy cells in Excel or Google Sheets and paste them here."
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <p role="status" className="text-xs text-muted-foreground">
          {valid
            ? `${formatNumber(shape.rows, locale)} rows × ${formatNumber(shape.columns, locale)} columns. Types are detected as for a CSV file.`
            : 'Paste at least a header row and one row of cells.'}
        </p>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!valid}>
          Create table
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Paste cells from a spreadsheet → a new table (F-DATA-10). The text stays on this device. */
export function PasteDataDialog() {
  const pasteText = useUiStore((state) => state.pasteText)
  const setPasteText = useUiStore((state) => state.setPasteText)
  const open = pasteText !== null

  return (
    <Dialog open={open} onOpenChange={(next) => setPasteText(next ? (pasteText ?? '') : null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste data</DialogTitle>
          <DialogDescription>
            Make a table from cells copied in a spreadsheet. Nothing leaves this device.
          </DialogDescription>
        </DialogHeader>
        {open && <PasteForm initial={pasteText} onDone={() => setPasteText(null)} />}
      </DialogContent>
    </Dialog>
  )
}
