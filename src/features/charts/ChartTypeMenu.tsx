import { ChevronDown } from 'lucide-react'
import type { ChartChoice } from '@/charts/select'
import { CHART_GROUPS, CHART_TYPE_LABELS, type ChartSpec, type ChartType } from '@/charts/spec'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChartTypeIcon } from '@/features/charts/ChartTypeIcon'

/** "Change chart" (F-VIZ-03): every type, grouped by purpose; the ones that don't fit say why. */
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
  const byType = new Map<ChartType, ChartChoice>(choices.map((choice) => [choice.type, choice]))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="outline" aria-label={`Chart type: ${label}`}>
          <ChartTypeIcon type={current} />
          {label}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(34rem,var(--radix-dropdown-menu-content-available-height))] w-72"
      >
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            const spec = choices.find((choice) => choice.type === value)?.spec
            if (spec) onPick(spec)
          }}
        >
          {CHART_GROUPS.map((group, i) => (
            <div key={group.label} role="group" aria-label={group.label}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {group.label}
              </DropdownMenuLabel>
              {group.types.map((type) => {
                const choice = byType.get(type)
                if (!choice) return null
                return (
                  <DropdownMenuRadioItem
                    key={type}
                    value={type}
                    disabled={!choice.spec}
                    className="items-start"
                    title={choice.reason ?? undefined}
                  >
                    <ChartTypeIcon type={type} />
                    <span className="grid gap-0.5">
                      <span>{CHART_TYPE_LABELS[type]}</span>
                      {choice.reason && (
                        <span className="text-xs leading-snug text-muted-foreground">
                          {choice.reason}
                        </span>
                      )}
                    </span>
                  </DropdownMenuRadioItem>
                )
              })}
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
