import { CircleHelp, Keyboard, SunMoon } from 'lucide-react'
import { THEME_OPTIONS } from '@/app/themeOptions'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemePreferenceSchema } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

/** Help (D118): how it works, the shortcuts and the theme, behind one button instead of three. */
export function HelpMenu({ shortcuts = true }: { shortcuts?: boolean }) {
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const ui = useUiStore.getState
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Help and appearance">
          <CircleHelp />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => ui().setHowItWorksOpen(true)}>
          <CircleHelp aria-hidden />
          How flashQuery works
        </DropdownMenuItem>
        {shortcuts && (
          <DropdownMenuItem onSelect={() => ui().setShortcutsOpen(true)}>
            <Keyboard aria-hidden />
            Keyboard shortcuts
            <kbd className="ml-auto text-[11px] text-muted-foreground">?</kbd>
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
