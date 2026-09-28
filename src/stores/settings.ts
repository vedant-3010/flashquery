import { create } from 'zustand'
import type { PrivacyMode } from '@/ai/schemas'
import type { DateDisplay } from '@/lib/format'
import { readStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme'

interface SettingsState {
  theme: ThemePreference
  privacyMode: PrivacyMode
  /** BCP 47 locale passed to every src/lib/format.ts call. */
  locale: string
  /** How grids show DATE/TIMESTAMP values (F-GRID-03). */
  dateDisplay: DateDisplay
  setTheme: (theme: ThemePreference) => void
  setDateDisplay: (dateDisplay: DateDisplay) => void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  theme: readStoredTheme(),
  privacyMode: 'balanced',
  locale: navigator.language,
  dateDisplay: 'iso',
  setTheme: (theme) => {
    storeTheme(theme)
    set({ theme })
  },
  setDateDisplay: (dateDisplay) => set({ dateDisplay }),
}))
