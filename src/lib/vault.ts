import { AppError } from '@/lib/errors'

// The encrypted workspace (M17, PRD D123): everything a signed-in user saves to their account is
// encrypted here, in the browser, before it's sent. The server stores ciphertext it can't read.
//
// - One random data key per account (AES-GCM, 256 bits) encrypts every record and file.
// - The server keeps that key only wrapped (encrypted) twice: with a key derived from the user's
//   passphrase (PBKDF2-SHA256), and with a random recovery key the user writes down.
// - Every ciphertext is bound to where it belongs (additional authenticated data), so the server
//   can't swap one record or chunk for another.
// Pure WebCrypto: runs in browsers and in Node (tests).

/** OWASP's PBKDF2-HMAC-SHA256 recommendation (2023). */
export const KDF_ITERATIONS = 600_000
/** Files are encrypted in chunks this size, each stored as its own object. */
export const CHUNK_BYTES = 4 * 1024 * 1024
const FORMAT = 1
const IV_BYTES = 12

export interface KdfParams {
  alg: 'PBKDF2-SHA256'
  iterations: number
  /** base64 */
  salt: string
}

export interface WrappedKey {
  /** base64 */
  iv: string
  /** base64: the data key, encrypted. */
  data: string
}

/** What the server keeps about a vault: nothing that decrypts without the passphrase or recovery key. */
export interface VaultKeys {
  kdf: KdfParams
  wrapped: WrappedKey
  recoveryWrapped: WrappedKey
}

// ---- Encoding ------------------------------------------------------------------------------

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length))
const utf8 = (text: string) => new TextEncoder().encode(text)

/** Crockford's base32: no I, L, O or U, so a recovery key is easy to read back. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function fromBase32(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** 32 random bytes as 13 groups of 4 characters: "7K2M-9QXA-…". */
export function formatRecoveryKey(bytes: Uint8Array): string {
  return (toBase32(bytes).match(/.{1,4}/g) ?? []).join('-')
}

// ---- Keys ----------------------------------------------------------------------------------

async function passphraseKey(passphrase: string, kdf: KdfParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    utf8(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(kdf.salt), iterations: kdf.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

function recoveryKeyFrom(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['wrapKey', 'unwrapKey'])
}

async function wrap(dataKey: CryptoKey, wrapping: CryptoKey): Promise<WrappedKey> {
  const iv = random(IV_BYTES)
  const data = await crypto.subtle.wrapKey('raw', dataKey, wrapping, { name: 'AES-GCM', iv })
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

async function unwrap(
  wrapped: WrappedKey,
  wrapping: CryptoKey,
  extractable: boolean,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(wrapped.data),
    wrapping,
    { name: 'AES-GCM', iv: fromBase64(wrapped.iv) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

const wrongPassphrase = () =>
  new AppError({
    code: 'wrong_passphrase',
    message: 'That passphrase doesn’t unlock this workspace.',
    detail: null,
  })

const wrongRecoveryKey = () =>
  new AppError({
    code: 'wrong_recovery_key',
    message: 'That recovery key doesn’t unlock this workspace.',
    detail: null,
  })

/**
 * A new vault: a random data key, wrapped with the passphrase and with a new recovery key. Returns
 * what the server keeps, the data key to use now (not extractable) and the recovery key to show once.
 */
export async function createVault(
  passphrase: string,
  { iterations = KDF_ITERATIONS }: { iterations?: number } = {},
): Promise<{ keys: VaultKeys; dataKey: CryptoKey; recoveryKey: string }> {
  const kdf: KdfParams = { alg: 'PBKDF2-SHA256', iterations, salt: toBase64(random(16)) }
  const dataKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
  const recoveryBytes = random(32)
  const keys: VaultKeys = {
    kdf,
    wrapped: await wrap(dataKey, await passphraseKey(passphrase, kdf)),
    recoveryWrapped: await wrap(dataKey, await recoveryKeyFrom(recoveryBytes)),
  }
  return {
    keys,
    dataKey: await unwrap(keys.recoveryWrapped, await recoveryKeyFrom(recoveryBytes), false),
    recoveryKey: formatRecoveryKey(recoveryBytes),
  }
}

/** The data key, from the passphrase (`wrong_passphrase` otherwise). */
export async function unlockWithPassphrase(
  keys: VaultKeys,
  passphrase: string,
  { extractable = false }: { extractable?: boolean } = {},
): Promise<CryptoKey> {
  try {
    return await unwrap(keys.wrapped, await passphraseKey(passphrase, keys.kdf), extractable)
  } catch {
    throw wrongPassphrase()
  }
}

/** The data key, from the recovery key (`wrong_recovery_key` otherwise). */
export async function unlockWithRecoveryKey(
  keys: VaultKeys,
  recoveryKey: string,
  { extractable = false }: { extractable?: boolean } = {},
): Promise<CryptoKey> {
  const bytes = fromBase32(recoveryKey)
  if (!bytes || bytes.length !== 32) throw wrongRecoveryKey()
  try {
    return await unwrap(keys.recoveryWrapped, await recoveryKeyFrom(bytes), extractable)
  } catch {
    throw wrongRecoveryKey()
  }
}

/**
 * A new passphrase (after unlocking with the old one or the recovery key, `extractable: true`):
 * the same data key, wrapped again. Nothing else is re-encrypted.
 */
export async function rewrapWithPassphrase(
  keys: VaultKeys,
  extractableKey: CryptoKey,
  passphrase: string,
  { iterations = KDF_ITERATIONS }: { iterations?: number } = {},
): Promise<VaultKeys> {
  const kdf: KdfParams = { alg: 'PBKDF2-SHA256', iterations, salt: toBase64(random(16)) }
  return { ...keys, kdf, wrapped: await wrap(extractableKey, await passphraseKey(passphrase, kdf)) }
}

/** A new recovery key (the old one stops working). */
export async function rewrapWithNewRecoveryKey(
  keys: VaultKeys,
  extractableKey: CryptoKey,
): Promise<{ keys: VaultKeys; recoveryKey: string }> {
  const bytes = random(32)
  return {
    keys: { ...keys, recoveryWrapped: await wrap(extractableKey, await recoveryKeyFrom(bytes)) },
    recoveryKey: formatRecoveryKey(bytes),
  }
}

// ---- Records and file chunks ---------------------------------------------------------------

/** Where a record belongs: its ciphertext only decrypts there (and at that version). */
export const recordAad = (userId: string, scope: string, key: string, version: number) =>
  `hushglance/record/${userId}/${scope}/${key}/${version}`

/** Where a file chunk belongs. */
export const chunkAad = (userId: string, fileId: string, index: number, total: number) =>
  `hushglance/chunk/${userId}/${fileId}/${index}/${total}`

/** [format | IV | ciphertext + tag] */
async function seal(
  key: CryptoKey,
  plain: BufferSource,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = random(IV_BYTES)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    key,
    plain,
  )
  const out = new Uint8Array(1 + IV_BYTES + cipher.byteLength)
  out[0] = FORMAT
  out.set(iv, 1)
  out.set(new Uint8Array(cipher), 1 + IV_BYTES)
  return out
}

async function open(
  key: CryptoKey,
  sealed: Uint8Array<ArrayBuffer>,
  aad: string,
): Promise<ArrayBuffer> {
  if (sealed[0] !== FORMAT || sealed.length < 1 + IV_BYTES + 16) {
    throw new AppError({ code: 'vault_format', message: 'Unreadable saved data.', detail: null })
  }
  try {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.subarray(1, 1 + IV_BYTES), additionalData: utf8(aad) },
      key,
      sealed.subarray(1 + IV_BYTES),
    )
  } catch {
    throw new AppError({
      code: 'vault_tampered',
      message: 'Saved data didn’t decrypt: it was changed, or belongs elsewhere.',
      detail: aad,
    })
  }
}

/** A record (any JSON value), encrypted: base64, for a text column. */
export async function encryptRecord(key: CryptoKey, value: unknown, aad: string): Promise<string> {
  return toBase64(await seal(key, utf8(JSON.stringify(value)), aad))
}

export async function decryptRecord(
  key: CryptoKey,
  payload: string,
  aad: string,
): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await open(key, fromBase64(payload), aad))) as unknown
}

export function chunkCount(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / CHUNK_BYTES))
}

/** Bytes a file takes once encrypted (each chunk adds its format byte, IV and tag). */
export function sealedBytes(bytes: number): number {
  return bytes + chunkCount(bytes) * (1 + IV_BYTES + 16)
}

/** Chunk `index` of `file`, encrypted. Reads only that slice, so memory stays flat. */
export async function encryptChunk(
  key: CryptoKey,
  file: Blob,
  index: number,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const slice = await file.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).arrayBuffer()
  return seal(key, slice, aad)
}

export async function decryptChunk(
  key: CryptoKey,
  sealed: Uint8Array<ArrayBuffer>,
  aad: string,
): Promise<ArrayBuffer> {
  return open(key, sealed, aad)
}
