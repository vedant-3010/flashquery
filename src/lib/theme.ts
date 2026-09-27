import { z } from 'zod'

export const ThemePreferenceSchema = z.enum(['light', 'dark', 'system'])
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>
export type ResolvedTheme = 'light' | 'dark'

/** Must match public/theme-init.js, which applies the saved theme before first paint. */
export const THEME_STORAGE_KEY = 'askdata:theme'
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

// localStorage rather than IndexedDB: theme-init.js has to read it synchronously (PRD §12, D8).
export function readStoredTheme(): ThemePreference {
  try {
    const parsed = ThemePreferenceSchema.safeParse(localStorage.getItem(THEME_STORAGE_KEY))
    return parsed.success ? parsed.data : 'system'
  } catch {
    return 'system'
  }
}

export function storeTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Storage blocked (private mode, sandbox): the choice still applies for this session.
  }
}

export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}
