import { ChevronDown, Gauge } from 'lucide-react'
import { EFFORT_OPTIONS, openRouterEffort, requestEffort } from '@/ai/models'
import { EffortSchema } from '@/ai/schemas'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAiMode } from '@/stores/aiMode'
import { useSettingsStore } from '@/stores/settings'

/**
 * How hard the model thinks before writing SQL (F-ASK-16), for models that take an effort; Auto
 * picks per question (F-ASK-18). Hidden in demo mode and for models without one (Haiku 4.5,
 * custom and local models).
 */
export function EffortMenu() {
  const settings = useSettingsStore()
  const { effort, setEffort } = settings
  const mode = useAiMode()
  if (mode === 'demo') return null
  const model = mode === 'hosted' ? settings.hostedModel : settings.models[settings.provider]
  const takes =
    mode === 'hosted' || settings.provider === 'openrouter' ? openRouterEffort : requestEffort
  if (takes(model, effort) === null) return null
  const label = EFFORT_OPTIONS.find((option) => option.id === effort)?.label ?? effort

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Effort: ${label}`}
          title="How hard the model thinks"
        >
          <Gauge aria-hidden />
          {label}
          <ChevronDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Effort</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={effort}
          onValueChange={(value) => setEffort(EffortSchema.parse(value))}
        >
          {EFFORT_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.id} value={option.id}>
              <span className="grid">
                <span>{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
