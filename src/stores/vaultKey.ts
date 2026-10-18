import { idbStore } from '@/lib/idb'

// "Remember on this device" for the encrypted workspace (M17): the unlocked data key is kept in
// IndexedDB as a CryptoKey that can't be exported (scripts can use it, never read it), for one
// account and one vault. "Lock on this device", signing out and a vault set up again forget it.

const KEY = 'vaultKey'

interface Remembered {
  userId: string
  vaultCreatedAt: string
  key: CryptoKey
}

function isRemembered(value: unknown): value is Remembered {
  return (
    typeof value === 'object' &&
    value !== null &&
    'userId' in value &&
    'vaultCreatedAt' in value &&
    'key' in value &&
    value.key instanceof CryptoKey
  )
}

export async function rememberKey(remembered: Remembered): Promise<void> {
  if (remembered.key.extractable) throw new Error('HushGlance: only a non-extractable key is kept')
  await idbStore.set(KEY, remembered)
}

/** The key remembered for this account's current vault, or null. */
export async function rememberedKey(
  userId: string,
  vaultCreatedAt: string,
): Promise<CryptoKey | null> {
  const saved = await idbStore.get(KEY).catch(() => undefined)
  if (!isRemembered(saved)) return null
  return saved.userId === userId && saved.vaultCreatedAt === vaultCreatedAt ? saved.key : null
}

export async function forgetKey(): Promise<void> {
  await idbStore.del(KEY).catch(() => undefined)
}
