import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DARK_SCHEME_QUERY, resolveTheme, type ResolvedTheme } from '@/lib/theme'
import { useSettingsStore } from '@/stores/settings'

/** The theme actually shown, following the OS while the preference is "system". */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useSettingsStore((state) => state.theme)
  const systemPrefersDark = useMediaQuery(DARK_SCHEME_QUERY)
  return resolveTheme(preference, systemPrefersDark)
}
