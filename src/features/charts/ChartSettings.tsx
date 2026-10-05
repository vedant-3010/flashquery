import { SlidersHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import type { ResultShape } from '@/charts/classify'
import { fieldOptions, respec, type PreferredColumns } from '@/charts/select'
import { ANNOTATABLE, type ChartSpec } from '@/charts/spec'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AnnotationSettings } from '@/features/charts/AnnotationSettings'
import { humanizeName } from '@/lib/format'

const NONE = '__none__'
const VALUE_AXIS = new Set(['bar', 'hbar', 'grouped_bar', 'stacked_bar', 'line', 'area', 'scatter'])
const SORTABLE = new Set(['bar', 'hbar', 'grouped_bar', 'stacked_bar', 'donut'])

interface ChartSettingsProps {
  spec: ChartSpec
  shape: ResultShape
  question?: string
  currency: string | null
  onChange: (spec: ChartSpec) => void
}

function Field({
  label,
  value,
  options,
  onChange,
  allowNone = false,
}: {
  label: string
  value: string | null
  options: { name: string }[]
  onChange: (value: string | null) => void
  allowNone?: boolean
}) {
  const id = useId()
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>None</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.name} value={option.name}>
              {humanizeName(option.name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      <Label htmlFor={id} className="text-xs font-normal">
        {label}
      </Label>
    </div>
  )
}

/** Axis, series, display options and annotations for the current chart (F-VIZ-06, F-VIZ-08). */
export function ChartSettings({ spec, shape, question, currency, onChange }: ChartSettingsProps) {
  const [error, setError] = useState<string | null>(null)
  const options = fieldOptions(spec.type, shape)

  const refit = (pref: PreferredColumns) => {
    const result = respec(
      shape,
      spec,
      {
        x: spec.x,
        y: spec.y,
        series: spec.series,
        size: spec.size,
        ...pref,
      },
      { question, currency },
    )
    if (result.ok) {
      setError(null)
      onChange(result.spec)
    } else {
      setError(result.reason.charAt(0).toUpperCase() + result.reason.slice(1))
    }
  }

  return (
    <Popover onOpenChange={() => setError(null)}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost">
          <SlidersHorizontal aria-hidden />
          Chart settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-3">
        <p className="text-sm font-medium">Chart settings</p>
        {options.x.length > 0 && (
          <Field label="X axis" value={spec.x} options={options.x} onChange={(x) => refit({ x })} />
        )}
        {options.y.length > 0 &&
          (options.multiY && !spec.series ? (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1 text-xs font-medium">Values</legend>
              {options.y.map((column) => (
                <Toggle
                  key={column.name}
                  label={humanizeName(column.name)}
                  checked={spec.y.includes(column.name)}
                  onChange={(on) => {
                    const y = on
                      ? options.y
                          .map((c) => c.name)
                          .filter((n) => n === column.name || spec.y.includes(n))
                      : spec.y.filter((n) => n !== column.name)
                    if (y.length > 0) refit({ y })
                  }}
                />
              ))}
            </fieldset>
          ) : (
            <Field
              label={spec.type === 'scatter' ? 'Y axis' : 'Value'}
              value={spec.y[0] ?? null}
              options={options.y}
              onChange={(y) => y && refit({ y: [y] })}
            />
          ))}
        {options.series.length > 0 && (
          <Field
            label={spec.type === 'scatter' ? 'Color by' : 'Series'}
            value={spec.series}
            options={options.series.filter((column) => column.name !== spec.x)}
            allowNone={spec.type !== 'heatmap'}
            onChange={(series) => refit({ series })}
          />
        )}
        {spec.type === 'scatter' && options.size.length > 0 && (
          <Field
            label="Size"
            value={spec.size}
            options={options.size.filter((c) => c.name !== spec.x && c.name !== spec.y[0])}
            allowNone
            onChange={(size) => refit({ size })}
          />
        )}
        {SORTABLE.has(spec.type) && (
          <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
            <Label className="text-xs">Sort</Label>
            <Select
              value={spec.sort}
              onValueChange={(sort) => onChange({ ...spec, sort: sort as ChartSpec['sort'] })}
            >
              <SelectTrigger size="sm" className="w-full" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Highest first</SelectItem>
                <SelectItem value="asc">Lowest first</SelectItem>
                <SelectItem value="none">As in the result</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-2 border-t pt-3">
          {spec.type === 'area' && spec.series && (
            <Toggle
              label="Stack areas"
              checked={spec.stacked}
              onChange={(stacked) => onChange({ ...spec, stacked })}
            />
          )}
          {VALUE_AXIS.has(spec.type) && (
            <Toggle
              label="Log scale"
              checked={spec.logScale}
              onChange={(logScale) => onChange({ ...spec, logScale })}
            />
          )}
          <Toggle
            label="Value labels"
            checked={spec.labels}
            onChange={(labels) => onChange({ ...spec, labels })}
          />
        </div>
        {ANNOTATABLE.has(spec.type) && <AnnotationSettings spec={spec} onChange={onChange} />}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
