import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { ThemePreferenceSchema, type ThemePreference } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeMenu() {
  const preference = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const resolved = useResolvedTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Theme">{resolved === 'dark' ? <Moon /> : <Sun />}</IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setTheme(ThemePreferenceSchema.parse(value))}
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
