import { Moon, Sun } from 'lucide-react'
import { THEME_OPTIONS } from '@/app/themeOptions'
import { IconButton } from '@/components/IconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { ThemePreferenceSchema } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'

export function ThemeMenu() {
  const preference = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const resolved = useResolvedTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Theme">{resolved === 'dark' ? <Moon /> : <Sun />}</IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setTheme(ThemePreferenceSchema.parse(value))}
        >
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
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
