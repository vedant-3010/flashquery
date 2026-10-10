import {
  CircleHelp,
  Ellipsis,
  KeyRound,
  PanelRight,
  Settings,
  ShieldCheck,
  SunMoon,
} from 'lucide-react'
import { THEME_OPTIONS } from '@/app/themeOptions'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemePreferenceSchema } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { useEngineStore } from '@/stores/engine'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const ENGINE = {
  idle: 'Engine idle',
  loading: 'Engine loading',
  ready: 'Engine ready',
  error: 'Engine error',
} as const

/**
 * The top bar's extras on phones (D117): privacy mode, demo mode and the engine's status, then
 * Settings, the side panel, theme and how it works. Wider screens show them in the bar itself.
 */
export function AppMenu({ inProject }: { inProject: boolean }) {
  const mode = useSettingsStore((state) => state.privacyMode)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const engine = useEngineStore((state) => state.status)
  const ui = useUiStore.getState
  const sidePanelOpen = useUiStore((state) => state.sidePanelOpen)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="More" className="relative">
          <Ellipsis />
          {/* The engine still starting (or failed) is worth a glance without opening the menu. */}
          {(engine === 'loading' || engine === 'error') && (
            <span
              aria-hidden
              className={cn(
                'absolute top-1 right-1 size-1.5 rounded-full',
                engine === 'error' ? 'bg-destructive' : 'animate-pulse bg-amber-500',
              )}
            />
          )}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="flex items-center gap-1.5 text-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Privacy: {mode === 'strict' ? 'Strict' : 'Balanced'}
          </span>
          <span className="text-xs text-muted-foreground">
            {demo ? 'Demo mode · ' : ''}
            {ENGINE[engine]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => ui().setSettingsOpen(true)}>
          <Settings aria-hidden />
          Settings
        </DropdownMenuItem>
        {demo && (
          <DropdownMenuItem onSelect={() => ui().setSettingsOpen(true)}>
            <KeyRound aria-hidden />
            Add an AI key
          </DropdownMenuItem>
        )}
        {inProject && (
          <DropdownMenuItem onSelect={() => ui().setSidePanelOpen(!sidePanelOpen)}>
            <PanelRight aria-hidden />
            {sidePanelOpen ? 'Hide the side panel' : 'Preview, history and AI inspector'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunMoon aria-hidden />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) => setTheme(ThemePreferenceSchema.parse(value))}
            >
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon aria-hidden />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => ui().setHowItWorksOpen(true)}>
          <CircleHelp aria-hidden />
          How flashQuery works
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
