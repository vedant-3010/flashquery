import { z } from '@/lib/zod'
import { create } from 'zustand'
import { DEFAULT_LOCAL_URL, LOCAL_NO_KEY, localBaseUrl } from '@/ai/localServer'
import { DEFAULT_MODEL } from '@/ai/models'
import { ChartPaletteSchema, type ChartPalette } from '@/charts/spec'
import {
  EffortSchema,
  PrivacyModeSchema,
  ProviderIdSchema,
  type Effort,
  type PrivacyMode,
  type ProviderId,
} from '@/ai/schemas'
import type { DateDisplay } from '@/lib/format'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { readStoredTheme, storeTheme, type ThemePreference } from '@/lib/theme'
import { backupCorruptRecord } from '@/stores/persistence'

// Settings (F-AI-01, F-AI-02). API keys live in memory and are saved to IndexedDB only while
// "Remember on this device" is on (F-SEC-04). The theme stays in localStorage (PRD D8).

const KeysSchema = z.object({
  anthropic: z.string().nullable(),
  openai: z.string().nullable(),
  local: z.string().nullable(),
})
type Keys = z.infer<typeof KeysSchema>

const SavedSettingsSchema = z.object({
  provider: ProviderIdSchema,
  models: z.object({ anthropic: z.string(), openai: z.string(), local: z.string() }),
  /** The planner's reasoning effort, picked in the ask bar (F-ASK-16). */
  effort: EffortSchema,
  /** Chart colors unless a chart or dashboard picks its own (F-VIZ-12). */
  chartPalette: ChartPaletteSchema,
  /** Local OpenAI-compatible server (F-AI-06). */
  baseUrl: z.string(),
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
  /** Keep loaded files in the browser's private storage across reloads (F-DATA-12). Off by default. */
  persistFiles: z.boolean(),
})
type SavedSettings = z.infer<typeof SavedSettingsSchema>

const NO_KEYS: Keys = { anthropic: null, openai: null, local: null }

export const SETTINGS_RECORD: RecordSpec<SavedSettings> = {
  key: 'settings',
  version: 7,
  schema: SavedSettingsSchema,
  migrations: {
    // v2 (M4): number format and currency.
    1: (data) => ({ ...(data as object), numberLocale: null, currency: null }),
    // v3 (M6): Python auto-run, off.
    2: (data) => ({ ...(data as object), autoRunPython: false }),
    // v4 (M7): the guided tour, not seen yet.
    3: (data) => ({ ...(data as object), tourDone: false }),
    // v5 (stretch): a local OpenAI-compatible server, and keeping files (off).
    4: (data) => {
      const old = data as { models?: object; apiKeys?: object }
      return {
        ...old,
        models: { ...old.models, local: DEFAULT_MODEL.local },
        apiKeys: { ...old.apiKeys, local: null },
        baseUrl: DEFAULT_LOCAL_URL,
        persistFiles: false,
      }
    },
    // v6 (M9): reasoning effort, as before (medium), now chosen in the ask bar.
    5: (data) => ({ ...(data as object), effort: 'medium' }),
    // v7 (M10): chart colors, the new violet-led palette.
    6: (data) => ({ ...(data as object), chartPalette: 'flashquery' }),
  },
  fallback: () => ({
    provider: 'anthropic',
    models: { ...DEFAULT_MODEL },
    effort: 'medium',
    chartPalette: 'flashquery',
    privacyMode: 'balanced',
    dateDisplay: 'iso',
    rememberKey: false,
    apiKeys: NO_KEYS,
    baseUrl: DEFAULT_LOCAL_URL,
    numberLocale: null,
    currency: null,
    autoRunPython: false,
    tourDone: false,
    persistFiles: false,
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
  persistFiles: boolean
  /** How grids show DATE/TIMESTAMP values (F-GRID-03). */
  dateDisplay: DateDisplay
  provider: ProviderId
  models: Record<ProviderId, string>
  effort: Effort
  chartPalette: ChartPalette
  /** In memory; see rememberKey. */
  apiKeys: Keys
  /** Base URL of a local OpenAI-compatible server (F-AI-06). */
  baseUrl: string
  rememberKey: boolean
  hydrated: boolean
  setTheme: (theme: ThemePreference) => void
  setDateDisplay: (dateDisplay: DateDisplay) => void
  setPrivacyMode: (mode: PrivacyMode) => void
  setProvider: (provider: ProviderId) => void
  setModel: (provider: ProviderId, model: string) => void
  setEffort: (effort: Effort) => void
  setChartPalette: (palette: ChartPalette) => void
  setApiKey: (provider: ProviderId, key: string | null) => void
  setBaseUrl: (url: string) => void
  setRememberKey: (remember: boolean) => void
  setNumberLocale: (locale: string | null) => void
  setCurrency: (currency: string | null) => void
  setAutoRunPython: (on: boolean) => void
  setTourDone: (done: boolean) => void
  setPersistFiles: (on: boolean) => void
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
  persistFiles: false,
  dateDisplay: 'iso',
  provider: 'anthropic',
  models: { ...DEFAULT_MODEL },
  effort: 'medium',
  chartPalette: 'flashquery',
  apiKeys: NO_KEYS,
  baseUrl: DEFAULT_LOCAL_URL,
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
  setEffort: (effort) => set({ effort }),
  setChartPalette: (chartPalette) => set({ chartPalette }),
  setApiKey: (provider, key) =>
    set({ apiKeys: { ...get().apiKeys, [provider]: key?.trim() || null } }),
  setBaseUrl: (baseUrl) => set({ baseUrl: baseUrl.trim() }),
  setRememberKey: (rememberKey) => set({ rememberKey }),
  setNumberLocale: (numberLocale) =>
    set({ numberLocale, locale: numberLocale ?? navigator.language }),
  setCurrency: (currency) => set({ currency }),
  setAutoRunPython: (autoRunPython) => set({ autoRunPython }),
  setTourDone: (tourDone) => set({ tourDone }),
  setPersistFiles: (persistFiles) => set({ persistFiles }),
  hydrate: () => (hydrating ??= load()),
}))

let hydrating: Promise<void> | null = null

/** Loads saved settings once, then saves on every change. */
async function load() {
  const saved = await loadRecord(SETTINGS_RECORD, { onCorrupt: backupCorruptRecord }).catch(
    (error: unknown) => {
      // IndexedDB unavailable (private mode, blocked storage): run with defaults, in memory.
      console.warn('flashQuery: settings could not be loaded', error)
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
    effort: state.effort,
    chartPalette: state.chartPalette,
    privacyMode: state.privacyMode,
    dateDisplay: state.dateDisplay,
    rememberKey: state.rememberKey,
    apiKeys: state.rememberKey ? state.apiKeys : NO_KEYS,
    baseUrl: state.baseUrl,
    numberLocale: state.numberLocale,
    currency: state.currency,
    autoRunPython: state.autoRunPython,
    tourDone: state.tourDone,
    persistFiles: state.persistFiles,
  }
  await saveRecord(SETTINGS_RECORD, record).catch((error: unknown) =>
    console.warn('flashQuery: settings could not be saved', error),
  )
}

/**
 * The credential for the selected provider, or null (demo mode). A local server (F-AI-06) needs no
 * key: it is ready once it has a valid localhost URL and a model, and gets a placeholder key.
 */
export function activeApiKey(
  state: Pick<SettingsState, 'apiKeys' | 'provider' | 'baseUrl' | 'models'>,
): string | null {
  const key = state.apiKeys[state.provider]
  if (state.provider !== 'local') return key
  if (localBaseUrl(state.baseUrl) === null || state.models.local === '') return null
  return key ?? LOCAL_NO_KEY
}
