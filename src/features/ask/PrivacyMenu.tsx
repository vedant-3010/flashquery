import { ChevronDown, CircleHelp, ShieldCheck } from 'lucide-react'
import { PrivacyModeSchema } from '@/ai/schemas'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PRIVACY_MODES } from '@/features/settings/privacyText'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

/** The privacy mode (F-AI-02), switchable from the ask bar; it applies to the next question. */
export function PrivacyMenu() {
  const mode = useSettingsStore((state) => state.privacyMode)
  const setMode = useSettingsStore((state) => state.setPrivacyMode)
  const openHowItWorks = useUiStore((state) => state.setHowItWorksOpen)
  const label = PRIVACY_MODES[mode].label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Privacy: ${label}`}
          title="What the AI may see"
        >
          <ShieldCheck aria-hidden />
          {label}
          <ChevronDown aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Privacy mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => setMode(PrivacyModeSchema.parse(value))}
        >
          {PrivacyModeSchema.options.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <span className="grid">
                <span>{PRIVACY_MODES[id].label}</span>
                <span className="text-xs text-muted-foreground">{PRIVACY_MODES[id].summary}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openHowItWorks(true)}>
          <CircleHelp aria-hidden />
          What each mode sends
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
