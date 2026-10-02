import { Filter } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VALUE_LIST_LIMIT, type ColumnFilter, type ValueCount } from '@/engine/gridFilters'
import type { ColumnMeta } from '@/engine/types'
import { isCancellation } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings'

interface ColumnFilterPopoverProps {
  meta: ColumnMeta
  filter: ColumnFilter | undefined
  onChange: (filter: ColumnFilter | null) => void
  loadValues: (column: string, signal: AbortSignal) => Promise<ValueCount[]>
}

const numberOrNull = (text: string) => {
  const value = Number(text)
  return text.trim() === '' || !Number.isFinite(value) ? null : value
}

/** Editor for one filter: a value list or "contains" (text), a range, or dates. */
function FilterForm({ meta, filter, onChange, loadValues, onDone }: FilterFormProps) {
  const locale = useSettingsStore((state) => state.locale)
  const id = useId()
  const kind = meta.logicalType
  const numeric = kind === 'integer' || kind === 'number'
  const dated = kind === 'date' || kind === 'timestamp'
  const [text, setText] = useState(filter?.kind === 'contains' ? filter.text : '')
  const [min, setMin] = useState(filter?.kind === 'range' ? String(filter.min ?? '') : '')
  const [max, setMax] = useState(filter?.kind === 'range' ? String(filter.max ?? '') : '')
  const [from, setFrom] = useState(filter?.kind === 'dates' ? (filter.from ?? '') : '')
  const [to, setTo] = useState(filter?.kind === 'dates' ? (filter.to ?? '') : '')
  const [picked, setPicked] = useState<(string | null)[]>(
    filter?.kind === 'values' ? filter.values : [],
  )
  const [values, setValues] = useState<ValueCount[] | null>(null)

  useEffect(() => {
    if (numeric || dated) return
    const controller = new AbortController()
    loadValues(meta.name, controller.signal)
      .then(setValues)
      .catch((error: unknown) => {
        if (!isCancellation(error)) setValues([])
      })
    return () => controller.abort()
  }, [meta.name, numeric, dated, loadValues])

  // Few distinct values: pick from a list. Otherwise "contains".
  const listed = values !== null && values.length <= VALUE_LIST_LIMIT ? values : null

  const apply = () => {
    const column = meta.name
    if (numeric) onChange({ column, kind: 'range', min: numberOrNull(min), max: numberOrNull(max) })
    else if (dated) onChange({ column, kind: 'dates', from: from || null, to: to || null })
    else if (listed && picked.length > 0) onChange({ column, kind: 'values', values: picked })
    else onChange({ column, kind: 'contains', text: text.trim() })
    onDone()
  }

  return (
    <form
      className="grid gap-3 text-xs"
      onSubmit={(event) => {
        event.preventDefault()
        apply()
      }}
    >
      {numeric && (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor={`${id}-min`}>At least</Label>
            <Input
              id={`${id}-min`}
              inputMode="decimal"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${id}-max`}>At most</Label>
            <Input
              id={`${id}-max`}
              inputMode="decimal"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
        </div>
      )}
      {dated && (
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input
              id={`${id}-from`}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${id}-to`}>To</Label>
            <Input id={`${id}-to`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      )}
      {!numeric && !dated && values === null && (
        <p className="text-muted-foreground">Reading values…</p>
      )}
      {listed && (
        <fieldset className="grid max-h-56 gap-1 overflow-y-auto">
          <legend className="sr-only">Values of {meta.name}</legend>
          {listed.map(({ value, count }) => {
            const checked = picked.includes(value)
            const optionId = `${id}-v-${value ?? '∅'}`
            return (
              <div key={value ?? '∅'} className="flex items-center gap-2">
                <Checkbox
                  id={optionId}
                  checked={checked}
                  onCheckedChange={(on) =>
                    setPicked(on === true ? [...picked, value] : picked.filter((v) => v !== value))
                  }
                />
                <Label
                  htmlFor={optionId}
                  className={cn('min-w-0 flex-1 truncate font-normal', value === null && 'italic')}
                >
                  {value ?? 'null'}
                </Label>
                <span className="text-muted-foreground tabular-nums">
                  {formatNumber(count, locale)}
                </span>
              </div>
            )
          })}
        </fieldset>
      )}
      {values !== null && !listed && (
        <div className="grid gap-1">
          <Label htmlFor={`${id}-text`}>Contains</Label>
          <Input id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        {filter && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              onChange(null)
              onDone()
            }}
          >
            Clear
          </Button>
        )}
        <Button type="submit" size="xs">
          Apply
        </Button>
      </div>
    </form>
  )
}

interface FilterFormProps extends ColumnFilterPopoverProps {
  onDone: () => void
}

/** The funnel button in a column header (F-GRID-04); filled when the column is filtered. */
export function ColumnFilterPopover(props: ColumnFilterPopoverProps) {
  const [open, setOpen] = useState(false)
  const active = props.filter !== undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            active ? `Filter on ${props.meta.name} (active)` : `Filter ${props.meta.name}`
          }
          className={cn(
            'mr-1 shrink-0 rounded p-0.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
            active
              ? 'text-primary'
              : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Filter className={cn('size-3', active && 'fill-current')} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        {open && <FilterForm {...props} onDone={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  )
}
