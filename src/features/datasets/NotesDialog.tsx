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
import type { DatasetProfile } from '@/engine/types'
import { useDatasetsStore } from '@/stores/datasets'
import { notesOf, type DatasetNotes } from '@/stores/notes'

type ColumnNote = DatasetNotes['columns'][string]
const EMPTY: ColumnNote = { description: null, unit: null }

function NotesForm({ dataset, onDone }: { dataset: DatasetProfile; onDone: () => void }) {
  const setNotes = useDatasetsStore((state) => state.setNotes)
  const [draft, setDraft] = useState<DatasetNotes>(() => notesOf(dataset))
  const notesId = useId()
  const note = (name: string) => draft.columns[name] ?? EMPTY
  const update = (name: string, change: Partial<ColumnNote>) =>
    setDraft({ ...draft, columns: { ...draft.columns, [name]: { ...note(name), ...change } } })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setNotes(dataset.id, draft)
    onDone()
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor={notesId}>About this data</Label>
        <Textarea
          id={notesId}
          rows={3}
          maxLength={4000}
          placeholder="e.g. Fiscal year starts in April. Amounts are in INR, before tax."
          value={draft.notes ?? ''}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        />
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Columns</legend>
        <div className="grid max-h-72 grid-cols-[minmax(6rem,auto)_1fr_6rem] items-center gap-x-2 gap-y-1.5 overflow-y-auto pr-1 text-xs">
          <span className="text-muted-foreground">Column</span>
          <span className="text-muted-foreground">Meaning</span>
          <span className="text-muted-foreground">Unit</span>
          {dataset.columns.map((column) => (
            <div key={column.name} className="contents">
              <span className="truncate font-mono" title={column.name}>
                {column.name}
              </span>
              <Input
                aria-label={`What ${column.name} means`}
                className="h-7 text-xs"
                maxLength={500}
                value={note(column.name).description ?? ''}
                onChange={(event) => update(column.name, { description: event.target.value })}
              />
              <Input
                aria-label={`Unit of ${column.name}`}
                className="h-7 text-xs"
                maxLength={40}
                placeholder="INR, kg…"
                value={note(column.name).unit ?? ''}
                onChange={(event) => update(column.name, { unit: event.target.value })}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <DialogFooter>
        <Button type="submit">Save notes</Button>
      </DialogFooter>
    </form>
  )
}

/** Business notes for a dataset and its columns (F-PROF-05). */
export function NotesDialog({ dataset, open, onOpenChange }: NotesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Notes on {dataset.label}</DialogTitle>
          <DialogDescription>
            Tell the AI what the data means. Notes are sent with questions in every privacy mode (as
            your text, not data values) and kept on this device for re-uploads of this file.
          </DialogDescription>
        </DialogHeader>
        {open && <NotesForm dataset={dataset} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

interface NotesDialogProps {
  dataset: DatasetProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}
