import { create } from 'zustand'
import type { Account, Provider } from '@/platform/auth'
import { accountsConfig, hasStoredSession } from '@/platform/config'

// The account (F-ACCT-01…04). Accounts are optional: 'off' without a configured service, 'guest'
// until someone signs in. The Supabase chunk (src/platform/auth.ts) loads only for a saved session,
// a sign-in, or a page that finishes one (links, OAuth, reset), so guests never download it.

export type AuthStatus = 'off' | 'guest' | 'checking' | 'signed-in'

const platform = () => import('@/platform/auth')
type Platform = Awaited<ReturnType<typeof platform>>

interface AuthState {
  status: AuthStatus
  account: Account | null
  /** At app start (once): restores the saved session, if there is one. */
  start: () => void
  /** Loads the service and reads the account (finishing an email link, OAuth or reset). */
  connect: () => Promise<Account | null>
  signIn: (email: string, password: string) => Promise<void>
  /** 'confirm-email' when the project wants the address confirmed before the first sign-in. */
  signUp: (name: string, email: string, password: string) => Promise<'signed-in' | 'confirm-email'>
  sendSignInLink: (email: string) => Promise<void>
  signInWith: (provider: Provider) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  setPassword: (password: string) => Promise<void>
  rename: (name: string) => Promise<void>
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

let listening = false

/**
 * Known before anything renders: pages check it in their first render, before App's effects run
 * (a reset link or /app/account opened directly must not look signed out for a moment).
 */
function initialStatus(): AuthStatus {
  const config = accountsConfig()
  if (!config) return 'off'
  return hasStoredSession(config) ? 'checking' : 'guest'
}

export const useAuthStore = create<AuthState>()((set, get) => {
  const signedIn = (account: Account) => set({ status: 'signed-in', account })
  const signedOut = () => set({ status: 'guest', account: null })

  /** The service, once loaded, following sign-ins and sign-outs (this tab and others). */
  const load = async (): Promise<Platform> => {
    const auth = await platform()
    if (!listening) {
      listening = true
      auth.onAccountChange((event, account) => {
        if (event === 'SIGNED_OUT' || !account) signedOut()
        else signedIn(account)
      })
    }
    return auth
  }

  return {
    status: initialStatus(),
    account: null,
    start: () => {
      const status = initialStatus()
      if (status !== 'checking') return set({ status, account: null })
      set({ status })
      void get()
        .connect()
        .catch((error: unknown) => {
          console.warn('flashQuery: the saved session could not be restored', error)
          signedOut()
        })
    },
    connect: async () => {
      const account = await (await load()).currentAccount()
      if (account) signedIn(account)
      else signedOut()
      return account
    },
    signIn: async (email, password) => signedIn(await (await load()).signIn({ email, password })),
    signUp: async (name, email, password) => {
      const { account, next } = await (await load()).signUp({ name, email, password })
      if (account) signedIn(account)
      return next
    },
    sendSignInLink: async (email) => (await load()).sendSignInLink(email),
    signInWith: async (provider) => (await load()).signInWith(provider),
    sendPasswordReset: async (email) => (await load()).sendPasswordReset(email),
    setPassword: async (password) => (await load()).setPassword(password),
    rename: async (name) => {
      const account = get().account
      if (!account) return
      await (await load()).setDisplayName(account.id, name)
      signedIn({ ...account, name: name.trim() })
    },
    signOut: async () => {
      await (await load()).signOut()
      signedOut()
    },
    deleteAccount: async () => {
      await (await load()).deleteAccount()
      signedOut()
    },
  }
})

/** "Ada Lovelace" → "AL", "ada" → "A": the account menu's badge (no avatar images, D114). */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1)
  return letters.map((word) => word?.[0]?.toUpperCase() ?? '').join('') || '?'
}
