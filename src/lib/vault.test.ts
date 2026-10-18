// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CHUNK_BYTES,
  chunkAad,
  chunkCount,
  createVault,
  decryptChunk,
  decryptRecord,
  encryptChunk,
  encryptRecord,
  fromBase64,
  KDF_ITERATIONS,
  recordAad,
  rewrapWithNewRecoveryKey,
  rewrapWithPassphrase,
  sealedBytes,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from '@/lib/vault'

// The encrypted workspace (M17, D123): what the server stores can't be read without the passphrase
// or the recovery key, and can't be swapped between places. Fast key derivation in tests (1,000
// iterations); the app uses KDF_ITERATIONS.

const FAST = { iterations: 1_000 }
const USER = '00000000-0000-0000-0000-0000000000a1'

describe('vault keys', () => {
  it('uses OWASP’s PBKDF2 iteration count by default', () => {
    expect(KDF_ITERATIONS).toBe(600_000)
  })

  it('unlocks with the passphrase or the recovery key, and nothing else', async () => {
    const { keys, dataKey, recoveryKey } = await createVault('correct horse battery', FAST)
    expect(recoveryKey).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{1,4}){12}$/)
    // What the server keeps holds no passphrase and no usable key.
    const stored = JSON.stringify(keys)
    expect(stored).not.toContain('correct horse')
    expect(stored).not.toContain(recoveryKey.replace(/-/g, ''))

    const sealed = await encryptRecord(dataKey, { questions: ['Revenue by region'] }, 'here')
    const viaPassphrase = await unlockWithPassphrase(keys, 'correct horse battery')
    expect(await decryptRecord(viaPassphrase, sealed, 'here')).toEqual({
      questions: ['Revenue by region'],
    })
    // Lowercase, spaces and look-alike letters still read back.
    const typed = recoveryKey.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o')
    const viaRecovery = await unlockWithRecoveryKey(keys, typed)
    expect(await decryptRecord(viaRecovery, sealed, 'here')).toEqual({
      questions: ['Revenue by region'],
    })

    await expect(unlockWithPassphrase(keys, 'wrong horse battery')).rejects.toMatchObject({
      code: 'wrong_passphrase',
    })
    await expect(unlockWithRecoveryKey(keys, 'AAAA-BBBB')).rejects.toMatchObject({
      code: 'wrong_recovery_key',
    })
  })

  it('keeps the unlocked key out of reach of scripts', async () => {
    const { keys } = await createVault('correct horse battery', FAST)
    const key = await unlockWithPassphrase(keys, 'correct horse battery')
    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('changes the passphrase or the recovery key without re-encrypting anything', async () => {
    const { keys, dataKey, recoveryKey } = await createVault('first passphrase', FAST)
    const sealed = await encryptRecord(dataKey, 'kept', 'aad')
    const material = await unlockWithPassphrase(keys, 'first passphrase', { extractable: true })

    const moved = await rewrapWithPassphrase(keys, material, 'second passphrase', FAST)
    await expect(unlockWithPassphrase(moved, 'first passphrase')).rejects.toMatchObject({
      code: 'wrong_passphrase',
    })
    const key = await unlockWithPassphrase(moved, 'second passphrase')
    expect(await decryptRecord(key, sealed, 'aad')).toBe('kept')

    const renewed = await rewrapWithNewRecoveryKey(moved, material)
    expect(renewed.recoveryKey).not.toBe(recoveryKey)
    await expect(unlockWithRecoveryKey(renewed.keys, recoveryKey)).rejects.toMatchObject({
      code: 'wrong_recovery_key',
    })
    const recovered = await unlockWithRecoveryKey(renewed.keys, renewed.recoveryKey)
    expect(await decryptRecord(recovered, sealed, 'aad')).toBe('kept')
  })
})

describe('records', () => {
  it('only decrypt where they belong, and not when changed', async () => {
    const { dataKey } = await createVault('p', FAST)
    const here = recordAad(USER, 'p_123', 'history', 3)
    const sealed = await encryptRecord(dataKey, [{ text: 'Which customers owe us?' }], here)
    // Ciphertext, not the question.
    expect(atob(sealed)).not.toContain('customers')
    expect(await decryptRecord(dataKey, sealed, here)).toEqual([
      { text: 'Which customers owe us?' },
    ])

    // Another project, another record, another version, another user: refused.
    for (const elsewhere of [
      recordAad(USER, 'p_999', 'history', 3),
      recordAad(USER, 'p_123', 'notes', 3),
      recordAad(USER, 'p_123', 'history', 2),
      recordAad('00000000-0000-0000-0000-0000000000b2', 'p_123', 'history', 3),
    ]) {
      await expect(decryptRecord(dataKey, sealed, elsewhere)).rejects.toMatchObject({
        code: 'vault_tampered',
      })
    }
    const bytes = fromBase64(sealed)
    bytes[bytes.length - 1] ^= 1
    await expect(
      decryptRecord(dataKey, btoa(String.fromCharCode(...bytes)), here),
    ).rejects.toMatchObject({ code: 'vault_tampered' })
  })

  it('use a fresh IV every time', async () => {
    const { dataKey } = await createVault('p', FAST)
    const one = await encryptRecord(dataKey, 'same', 'aad')
    const two = await encryptRecord(dataKey, 'same', 'aad')
    expect(one).not.toBe(two)
  })
})

describe('file chunks', () => {
  it('encrypt a file in 4 MiB chunks that read back exactly, each bound to its place', async () => {
    const { dataKey } = await createVault('p', FAST)
    const bytes = new Uint8Array(CHUNK_BYTES + 1234)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) % 251
    const file = new Blob([bytes])
    const total = chunkCount(file.size)
    expect(total).toBe(2)

    const sealed = await Promise.all(
      [0, 1].map((index) => encryptChunk(dataKey, file, index, chunkAad(USER, 'f1', index, total))),
    )
    expect(sealed.reduce((sum, chunk) => sum + chunk.length, 0)).toBe(sealedBytes(file.size))
    const parts = await Promise.all(
      sealed.map((chunk, index) =>
        decryptChunk(dataKey, chunk, chunkAad(USER, 'f1', index, total)),
      ),
    )
    expect(new Uint8Array(await new Blob(parts).arrayBuffer())).toEqual(bytes)

    // Chunks can't be reordered or moved to another file.
    await expect(
      decryptChunk(dataKey, sealed[0] ?? new Uint8Array(), chunkAad(USER, 'f1', 1, total)),
    ).rejects.toMatchObject({ code: 'vault_tampered' })
    await expect(
      decryptChunk(dataKey, sealed[0] ?? new Uint8Array(), chunkAad(USER, 'f2', 0, total)),
    ).rejects.toMatchObject({ code: 'vault_tampered' })
  })

  it('count an empty file as one chunk', () => {
    expect(chunkCount(0)).toBe(1)
    expect(chunkCount(CHUNK_BYTES)).toBe(1)
    expect(chunkCount(CHUNK_BYTES + 1)).toBe(2)
  })
})
