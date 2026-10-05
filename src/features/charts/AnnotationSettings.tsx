import { useId, useState } from 'react'
import { NO_ANNOTATIONS, type ChartSpec } from '@/charts/spec'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Number shown in the box: percent charts take "40" for 40%. */
const toInput = (target: number | null, percent: boolean) =>
  target === null ? '' : String(percent ? Math.round(target * 10_000) / 100 : target)

/** Max/min markers, average and target lines (F-VIZ-08), in the chart settings popover. */
export function AnnotationSettings({
  spec,
  onChange,
}: {
  spec: ChartSpec
  onChange: (spec: ChartSpec) => void
}) {
  const id = useId()
  const annotations = spec.annotations ?? NO_ANNOTATIONS
  const percent = spec.format.y === 'percent'
  const [target, setTarget] = useState(() => toInput(annotations.target, percent))
  const update = (change: Partial<typeof annotations>) =>
    onChange({ ...spec, annotations: { ...annotations, ...change } })

  const commitTarget = (text: string) => {
    const value = Number(text.replace(/[,%\s]/g, ''))
    const next =
      text.trim() === '' || !Number.isFinite(value) ? null : percent ? value / 100 : value
    if (next !== annotations.target) update({ target: next })
  }

  return (
    <fieldset className="grid gap-2 border-t pt-3">
      <legend className="mb-1 text-xs font-medium">Annotations</legend>
      {spec.stacked ? (
        <p className="text-xs text-muted-foreground">Stacked charts can show a target line.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-extremes`}
              checked={annotations.extremes}
              onCheckedChange={(on) => update({ extremes: on === true })}
            />
            <Label htmlFor={`${id}-extremes`} className="text-xs font-normal">
              Mark highest and lowest
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-average`}
              checked={annotations.average}
              onCheckedChange={(on) => update({ average: on === true })}
            />
            <Label htmlFor={`${id}-average`} className="text-xs font-normal">
              Average line
            </Label>
          </div>
        </>
      )}
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
        <Label htmlFor={`${id}-target`} className="text-xs">
          Target{percent ? ' (%)' : ''}
        </Label>
        <Input
          id={`${id}-target`}
          inputMode="decimal"
          placeholder="None"
          className="h-7 text-xs"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          onBlur={() => commitTarget(target)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitTarget(target)
          }}
        />
      </div>
    </fieldset>
  )
}
