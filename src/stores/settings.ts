import { create } from 'zustand'
import type { PrivacyMode } from '@/ai/schemas'
import { readStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme'

interface SettingsState {
  theme: ThemePreference
  privacyMode: PrivacyMode
  /** BCP 47 locale passed to every src/lib/format.ts call. */
  locale: string
  setTheme: (theme: ThemePreference) => void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  theme: readStoredTheme(),
  privacyMode: 'balanced',
  locale: navigator.language,
  setTheme: (theme) => {
    storeTheme(theme)
    set({ theme })
  },
}))
