import { parseServiceUrl } from '@/platform/serviceUrl'

// Is there an account service, and is someone signed in to it? Answered without loading
// supabase-js, so guests and the demo never download it (F-ACCT-04, F-SEC-09). The URL and
// publishable key are public build configuration (D102); without them, accounts are off.

export interface AccountsConfig {
  /** https://<project>.supabase.co */
  url: string
  key: string
  /** Where supabase-js keeps the session in localStorage. */
  storageKey: string
}

declare global {
  interface Window {
    /** e2e against the dev server points accounts at a mocked service. Development builds only. */
    __flashQueryAccounts?: { url: string; key: string }
  }
}

export function accountsConfig(): AccountsConfig | null {
  const override = import.meta.env.DEV ? window.__flashQueryAccounts : undefined
  const raw = override ?? {
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }
  const url = parseServiceUrl(raw.url)
  if (!url || !raw.key) return null
  const project = url.hostname.split('.')[0] ?? url.hostname
  return { url: url.origin, key: raw.key, storageKey: `sb-${project}-auth-token` }
}

/** Whether a session was saved in this browser (then supabase-js loads to restore it). */
export function hasStoredSession(config: AccountsConfig): boolean {
  try {
    return localStorage.getItem(config.storageKey) !== null
  } catch {
    return false
  }
}
