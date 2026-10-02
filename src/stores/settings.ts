import { z } from '@/lib/zod'
import { create } from 'zustand'
import { DEFAULT_MODEL } from '@/ai/models'
import {
  PrivacyModeSchema,
  ProviderIdSchema,
  type PrivacyMode,
  type ProviderId,
} from '@/ai/schemas'
import type { DateDisplay } from '@/lib/format'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { readStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme'
import { backupCorruptRecord } from '@/stores/persistence'

// Settings (F-AI-01, F-AI-02). API keys live in memory and are saved to IndexedDB only while
// "Remember on this device" is on (F-SEC-04). The theme stays in localStorage (PRD D8).

const KeysSchema = z.object({ anthropic: z.string().nullable(), openai: z.string().nullable() })
type Keys = z.infer<typeof KeysSchema>

const SavedSettingsSchema = z.object({
  provider: ProviderIdSchema,
  models: z.object({ anthropic: z.string(), openai: z.string() }),
  privacyMode: PrivacyModeSchema,
  dateDisplay: z.enum(['iso', 'locale']),
  rememberKey: z.boolean(),
  /** Only filled while rememberKey is on. */
  apiKeys: KeysSchema,
  /** Number and date format (BCP 47); null follows the browser (F-VIZ-04). */
  numberLocale: z.string().nullable(),
  /** ISO 4217 code for money columns in charts and summaries; null shows plain numbers. */
  currency: z.string().nullable(),
  /** Run AI-written Python without asking first (F-PY-03). Off by default. */
  autoRunPython: z.boolean(),
  /** The first-run tour was finished or skipped (F-SHELL-05). */
  tourDone: z.boolean(),
})
type SavedSettings = z.infer<typeof SavedSettingsSchema>

const NO_KEYS: Keys = { anthropic: null, openai: null }

export const SETTINGS_RECORD: RecordSpec<SavedSettings> = {
  key: 'settings',
  version: 4,
  schema: SavedSettingsSchema,
  migrations: {
    // v2 (M4): number format and currency.
    1: (data) => ({ ...(data as object), numberLocale: null, currency: null }),
    // v3 (M6): Python auto-run, off.
    2: (data) => ({ ...(data as object), autoRunPython: false }),
    // v4 (M7): the guided tour, not seen yet.
    3: (data) => ({ ...(data as object), tourDone: false }),
  },
  fallback: () => ({
    provider: 'anthropic',
    models: { ...DEFAULT_MODEL },
    privacyMode: 'balanced',
    dateDisplay: 'iso',
    rememberKey: false,
    apiKeys: NO_KEYS,
    numberLocale: null,
    currency: null,
    autoRunPython: false,
    tourDone: false,
  }),
}

interface SettingsState {
  theme: ThemePreference
  privacyMode: PrivacyMode
  /** BCP 47 locale passed to every src/lib/format.ts call: numberLocale, else the browser's. */
  locale: string
  numberLocale: string | null
  currency: string | null
  autoRunPython: boolean
  tourDone: boolean
  /** How grids show DATE/TIMESTAMP values (F-GRID-03). */
  dateDisplay: DateDisplay
  provider: ProviderId
  models: Record<ProviderId, string>
  /** In memory; see rememberKey. */
  apiKeys: Keys
  rememberKey: boolean
  hydrated: boolean
  setTheme: (theme: ThemePreference) => void
  setDateDisplay: (dateDisplay: DateDisplay) => void
  setPrivacyMode: (mode: PrivacyMode) => void
  setProvider: (provider: ProviderId) => void
  setModel: (provider: ProviderId, model: string) => void
  setApiKey: (provider: ProviderId, key: string | null) => void
  setRememberKey: (remember: boolean) => void
  setNumberLocale: (locale: string | null) => void
  setCurrency: (currency: string | null) => void
  setAutoRunPython: (on: boolean) => void
  setTourDone: (done: boolean) => void
  /** Loads saved settings (once, at startup), then saves every change. */
  hydrate: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  theme: readStoredTheme(),
  privacyMode: 'balanced',
  locale: navigator.language,
  numberLocale: null,
  currency: null,
  autoRunPython: false,
  tourDone: false,
  dateDisplay: 'iso',
  provider: 'anthropic',
  models: { ...DEFAULT_MODEL },
  apiKeys: NO_KEYS,
  rememberKey: false,
  hydrated: false,
  setTheme: (theme) => {
    storeTheme(theme)
    set({ theme })
  },
  setDateDisplay: (dateDisplay) => set({ dateDisplay }),
  setPrivacyMode: (privacyMode) => set({ privacyMode }),
  setProvider: (provider) => set({ provider }),
  setModel: (provider, model) => set({ models: { ...get().models, [provider]: model.trim() } }),
  setApiKey: (provider, key) =>
    set({ apiKeys: { ...get().apiKeys, [provider]: key?.trim() || null } }),
  setRememberKey: (rememberKey) => set({ rememberKey }),
  setNumberLocale: (numberLocale) =>
    set({ numberLocale, locale: numberLocale ?? navigator.language }),
  setCurrency: (currency) => set({ currency }),
  setAutoRunPython: (autoRunPython) => set({ autoRunPython }),
  setTourDone: (tourDone) => set({ tourDone }),
  hydrate: () => (hydrating ??= load()),
}))

let hydrating: Promise<void> | null = null

/** Loads saved settings once, then saves on every change. */
async function load() {
  const saved = await loadRecord(SETTINGS_RECORD, { onCorrupt: backupCorruptRecord }).catch(
    (error: unknown) => {
      // IndexedDB unavailable (private mode, blocked storage): run with defaults, in memory.
      console.warn('AskData: settings could not be loaded', error)
      return SETTINGS_RECORD.fallback()
    },
  )
  useSettingsStore.setState({
    ...saved,
    locale: saved.numberLocale ?? navigator.language,
    hydrated: true,
  })
  useSettingsStore.subscribe((state) => void persist(state))
}

async function persist(state: SettingsState) {
  const record: SavedSettings = {
    provider: state.provider,
    models: state.models,
    privacyMode: state.privacyMode,
    dateDisplay: state.dateDisplay,
    rememberKey: state.rememberKey,
    apiKeys: state.rememberKey ? state.apiKeys : NO_KEYS,
    numberLocale: state.numberLocale,
    currency: state.currency,
    autoRunPython: state.autoRunPython,
    tourDone: state.tourDone,
  }
  await saveRecord(SETTINGS_RECORD, record).catch((error: unknown) =>
    console.warn('AskData: settings could not be saved', error),
  )
}

/** The key for the selected provider, or null (demo mode). */
export function activeApiKey(state: Pick<SettingsState, 'apiKeys' | 'provider'>): string | null {
  return state.apiKeys[state.provider]
}
