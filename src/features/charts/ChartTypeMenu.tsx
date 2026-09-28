import { ChevronDown } from 'lucide-react'
import type { ChartChoice } from '@/charts/select'
import { CHART_TYPE_LABELS, type ChartSpec, type ChartType } from '@/charts/spec'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChartTypeIcon } from '@/features/charts/ChartTypeIcon'

/** "Change chart" (F-VIZ-03): every type; the ones that don't fit say why. */
export function ChartTypeMenu({
  current,
  choices,
  onPick,
}: {
  current: ChartType
  choices: ChartChoice[]
  onPick: (spec: ChartSpec) => void
}) {
  const label = CHART_TYPE_LABELS[current]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="outline" aria-label={`Chart type: ${label}`}>
          <ChartTypeIcon type={current} />
          {label}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Chart type</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            const spec = choices.find((choice) => choice.type === value)?.spec
            if (spec) onPick(spec)
          }}
        >
          {choices.map((choice) => (
            <DropdownMenuRadioItem
              key={choice.type}
              value={choice.type}
              disabled={!choice.spec}
              className="items-start"
              title={choice.reason ?? undefined}
            >
              <ChartTypeIcon type={choice.type} />
              <span className="grid gap-0.5">
                <span>{CHART_TYPE_LABELS[choice.type]}</span>
                {choice.reason && (
                  <span className="text-xs leading-snug text-muted-foreground">
                    {choice.reason}
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
