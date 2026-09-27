import { useState, type FormEvent } from 'react'
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
import type { DatasetProfile } from '@/engine/types'
import { toAppError } from '@/lib/errors'
import { useDatasetsStore } from '@/stores/datasets'

interface RenameDatasetDialogProps {
  dataset: DatasetProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}

function RenameForm({ dataset, onDone }: { dataset: DatasetProfile; onDone: () => void }) {
  const renameDataset = useDatasetsStore((state) => state.renameDataset)
  const [label, setLabel] = useState(dataset.label)
  const [table, setTable] = useState(dataset.table)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await renameDataset(dataset.id, { label, table })
      onDone()
    } catch (caught) {
      setError(toAppError(caught).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Rename table</DialogTitle>
        <DialogDescription>
          The display name is for you. Queries use the SQL name.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="dataset-label">Display name</Label>
        <Input id="dataset-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="dataset-table">SQL table name</Label>
        <Input
          id="dataset-table"
          className="font-mono"
          value={table}
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby="dataset-table-help"
          onChange={(e) => setTable(e.target.value.toLowerCase())}
        />
        <p
          id="dataset-table-help"
          className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
        >
          {error ?? 'Lowercase letters, digits and underscores.'}
        </p>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

export function RenameDatasetDialog({ dataset, open, onOpenChange }: RenameDatasetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open so each opening starts from the current names. */}
        {open && <RenameForm dataset={dataset} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
