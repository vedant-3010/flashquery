import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import type { CsvOptions } from '@/engine/ingest'
import type { DatasetProfile } from '@/engine/types'
import { importOptionsOf, reimportDataset } from '@/stores/datasetEdits'

const DELIMITERS = { auto: 'Detect', ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' }
const HEADERS = { auto: 'Detect', yes: 'First row is the header', no: 'No header row' }

function OptionsForm({ dataset, onDone }: { dataset: DatasetProfile; onDone: () => void }) {
  const initial = importOptionsOf(dataset.id)
  const [csv, setCsv] = useState<CsvOptions | null>(initial?.csv ?? null)
  const [skipBad, setSkipBad] = useState(initial?.ignoreErrors ?? false)
  const id = useId()
  if (!csv) return null
  const update = (change: Partial<CsvOptions>) => setCsv({ ...csv, ...change })

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        reimportDataset(dataset.id, csv, skipBad)
        onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-delimiter`}>Delimiter</Label>
          <Select
            value={csv.delimiter ?? 'auto'}
            onValueChange={(value) => update({ delimiter: value === 'auto' ? null : value })}
          >
            <SelectTrigger id={`${id}-delimiter`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DELIMITERS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-header`}>Header</Label>
          <Select
            value={csv.header === null ? 'auto' : csv.header ? 'yes' : 'no'}
            onValueChange={(value) => update({ header: value === 'auto' ? null : value === 'yes' })}
          >
            <SelectTrigger id={`${id}-header`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(HEADERS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-skip`}>Skip rows at the top</Label>
          <Input
            id={`${id}-skip`}
            type="number"
            min={0}
            value={csv.skipRows}
            onChange={(event) =>
              update({ skipRows: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-dates`}>Date format</Label>
          <Input
            id={`${id}-dates`}
            placeholder="Detect, or e.g. %d/%m/%Y"
            spellCheck={false}
            className="font-mono"
            maxLength={40}
            value={csv.dateFormat ?? ''}
            onChange={(event) => update({ dateFormat: event.target.value.trim() || null })}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-text`}
            checked={csv.allText}
            onCheckedChange={(checked) => update({ allText: checked === true })}
          />
          <Label htmlFor={`${id}-text`} className="font-normal">
            Load every column as text (then change types per column)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-bad`}
            checked={skipBad}
            onCheckedChange={(checked) => setSkipBad(checked === true)}
          />
          <Label htmlFor={`${id}-bad`} className="font-normal">
            Skip rows that can&apos;t be read
          </Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit">Re-import</Button>
      </DialogFooter>
    </form>
  )
}

/** CSV import options and re-import (F-DATA-08). The current table stays until the new one loads. */
export function ImportOptionsDialog({ dataset, open, onOpenChange }: ImportOptionsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import options for {dataset.label}</DialogTitle>
          <DialogDescription>
            Read the file again with these settings. Column type changes are kept.
          </DialogDescription>
        </DialogHeader>
        {open && <OptionsForm dataset={dataset} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

interface ImportOptionsDialogProps {
  dataset: DatasetProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}
