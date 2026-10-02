import { useEffect, useId, useState } from 'react'
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
import { RETYPE_TARGETS, type RetypePreview, type TypeOverride } from '@/engine/retype'
import type { ColumnProfile, DatasetProfile } from '@/engine/types'
import { isCancellation, toAppError } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { changeColumnType, previewColumnType } from '@/stores/datasetEdits'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

type Target = TypeOverride['type']

const TARGET_LABELS: Record<Target, string> = {
  VARCHAR: 'Text',
  BIGINT: 'Whole number',
  DOUBLE: 'Decimal number',
  DATE: 'Date',
  TIMESTAMP: 'Date and time',
  BOOLEAN: 'Yes/No',
}

function TypeForm({ dataset, column, onDone }: TypeFormProps) {
  const locale = useSettingsStore((state) => state.locale)
  const toast = useToastStore((state) => state.show)
  const [type, setType] = useState<Target>(column.type === 'VARCHAR' ? 'DATE' : 'VARCHAR')
  const [format, setFormat] = useState('')
  const [preview, setPreview] = useState<{ key: string; result: RetypePreview } | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const dated = type === 'DATE' || type === 'TIMESTAMP'
  const override: TypeOverride = {
    column: column.name,
    type,
    format: dated && format.trim() ? format.trim() : null,
  }
  const key = JSON.stringify(override)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const next = JSON.parse(key) as TypeOverride
      previewColumnType(dataset.id, next, controller.signal)
        .then((result) => result && setPreview({ key, result }))
        .catch((caught: unknown) => {
          if (!isCancellation(caught)) setError({ key, message: toAppError(caught).message })
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [dataset.id, key])

  const current = preview?.key === key ? preview.result : null
  const problem = error?.key === key ? error.message : null

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        changeColumnType(dataset.id, override)
          .then(() => {
            toast(`${column.name} is now ${TARGET_LABELS[type].toLowerCase()}.`)
            onDone()
          })
          .catch((caught: unknown) => {
            setSaving(false)
            setError({ key, message: toAppError(caught).message })
          })
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-type`}>Convert to</Label>
          <Select value={type} onValueChange={(value) => setType(value as Target)}>
            <SelectTrigger id={`${id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETYPE_TARGETS.map((target) => (
                <SelectItem key={target} value={target}>
                  {TARGET_LABELS[target]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {dated && (
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-format`}>Format</Label>
            <Input
              id={`${id}-format`}
              placeholder="Detect, or e.g. %d/%m/%Y"
              spellCheck={false}
              className="font-mono"
              maxLength={40}
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            />
          </div>
        )}
      </div>
      <p role="status" className="min-h-10 text-xs text-muted-foreground">
        {problem ? (
          <span className="text-destructive">{problem}</span>
        ) : !current ? (
          'Checking the values…'
        ) : current.failed === 0 ? (
          `All ${formatNumber(current.total, locale)} values convert.`
        ) : (
          <>
            {formatNumber(current.failed, locale)} of {formatNumber(current.total, locale)} values
            can&apos;t be converted and will become empty (null)
            {current.examples.length > 0 && <>, e.g. “{current.examples.join('”, “')}”</>}.
          </>
        )}
      </p>
      <DialogFooter>
        <Button type="submit" disabled={!current || saving}>
          Convert column
        </Button>
      </DialogFooter>
    </form>
  )
}

interface TypeFormProps {
  dataset: DatasetProfile
  column: ColumnProfile
  onDone: () => void
}

/** Change a column's type with TRY_CAST, reporting values that fail (F-DATA-09). */
export function ColumnTypeDialog({ dataset, column, open, onOpenChange }: ColumnTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Change the type of <span className="font-mono">{column.name}</span>
          </DialogTitle>
          <DialogDescription>
            Now {column.type}. The change is made on this device and kept if you re-import.
          </DialogDescription>
        </DialogHeader>
        {open && <TypeForm dataset={dataset} column={column} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

interface ColumnTypeDialogProps {
  dataset: DatasetProfile
  column: ColumnProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}
