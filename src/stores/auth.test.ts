import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@/platform/auth'

// F-ACCT-01…04 with a fake account service: what the store does with sessions and sign-ins.

const ada: Account = { id: 'u1', email: 'ada@example.com', name: 'Ada Lovelace', provider: 'email' }

const config = vi.hoisted(() => ({
  value: null as null | { url: string; key: string; storageKey: string },
  stored: false,
}))
const service = vi.hoisted(() => ({
  currentAccount: vi.fn(),
  onAccountChange: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  setDisplayName: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('@/platform/config', () => ({
  accountsConfig: () => config.value,
  hasStoredSession: () => config.stored,
}))
vi.mock('@/platform/auth', () => service)

// The store listens once per page: keep whichever listener it registers.
let changeListener: ((event: string, account: Account | null) => void) | null = null
service.onAccountChange.mockImplementation((listener) => {
  changeListener = listener
  return () => undefined
})

const { useAuthStore, initials } = await import('@/stores/auth')

const configured = { url: 'https://p.supabase.co', key: 'k', storageKey: 'sb-p-auth-token' }

beforeEach(() => {
  vi.clearAllMocks()
  config.value = configured
  config.stored = false
  useAuthStore.setState({ status: 'off', account: null })
})

describe('auth store', () => {
  it('is off without a configured service, and a guest otherwise, without loading it', () => {
    config.value = null
    useAuthStore.getState().start()
    expect(useAuthStore.getState().status).toBe('off')
    config.value = configured
    useAuthStore.getState().start()
    expect(useAuthStore.getState().status).toBe('guest')
    expect(service.currentAccount).not.toHaveBeenCalled()
  })

  it('restores a saved session', async () => {
    config.stored = true
    service.currentAccount.mockResolvedValue(ada)
    useAuthStore.getState().start()
    expect(useAuthStore.getState().status).toBe('checking')
    await vi.waitFor(() => expect(useAuthStore.getState().status).toBe('signed-in'))
    expect(useAuthStore.getState().account).toEqual(ada)
  })

  it('signs in, renames, signs out', async () => {
    service.signIn.mockResolvedValue(ada)
    await useAuthStore.getState().signIn('ada@example.com', 'pw')
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-in', account: ada })
    await useAuthStore.getState().rename('  Countess  ')
    expect(service.setDisplayName).toHaveBeenCalledWith('u1', '  Countess  ')
    expect(useAuthStore.getState().account?.name).toBe('Countess')
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState()).toMatchObject({ status: 'guest', account: null })
  })

  it('reports when a new account must confirm its email first', async () => {
    service.signUp.mockResolvedValue({ account: null, next: 'confirm-email' })
    expect(await useAuthStore.getState().signUp('Ada', 'ada@example.com', 'pw12345678')).toBe(
      'confirm-email',
    )
    expect(useAuthStore.getState().status).toBe('off')
  })

  it('follows sign-outs from other tabs', async () => {
    service.signIn.mockResolvedValue(ada)
    await useAuthStore.getState().signIn('ada@example.com', 'pw')
    changeListener?.('SIGNED_OUT', null)
    expect(useAuthStore.getState().status).toBe('guest')
  })

  it('makes initials for the account badge', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('ada')).toBe('A')
    expect(initials('jean-luc picard')).toBe('JP')
    expect(initials('   ')).toBe('?')
  })
})
