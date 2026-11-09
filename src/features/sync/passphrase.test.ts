import { describe, expect, it } from 'vitest'
import { MIN_PASSPHRASE, passphraseProblem } from '@/features/sync/passphrase'

// The workspace passphrase (M17, D124): long, not a pattern, not the words everyone tries first.

const ok = (passphrase: string) => passphraseProblem(passphrase, passphrase)

describe('passphraseProblem', () => {
  it('accepts a few unrelated words', () => {
    expect(ok('orange tractor whisper')).toBeNull()
    expect(ok('Lagoon-Pickle-Atlas-91')).toBeNull()
  })

  it('needs 12 characters', () => {
    expect(MIN_PASSPHRASE).toBe(12)
    expect(ok('tractor pie')).toMatch(/12 characters/)
  })

  it('refuses patterns and the passphrases tried first', () => {
    for (const weak of [
      'aaaaaaaaaaaaaaa',
      '123456789012',
      'Password2024!',
      'password password',
      'correct horse battery staple',
      'qwertyqwerty12',
      'hushglance 2026',
      '!!!!!!!!!!!!@@@@',
    ]) {
      expect(ok(weak), weak).toMatch(/first anyone would try/)
    }
  })

  it('checks the two match last', () => {
    expect(passphraseProblem('orange tractor whisper', 'orange tractor')).toMatch(/don’t match/)
  })
})
