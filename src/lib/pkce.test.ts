import { describe, expect, it } from 'vitest'
import { challengeFor, randomVerifier } from '@/lib/pkce'

describe('PKCE (F-AI-07)', () => {
  it('makes URL-safe verifiers of 43 characters, different each time', () => {
    const a = randomVerifier()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomVerifier()).not.toBe(a)
  })

  it('derives the S256 challenge (RFC 7636 appendix B)', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})
