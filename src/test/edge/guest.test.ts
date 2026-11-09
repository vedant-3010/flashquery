// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clientAddress, guestKey, guestSubject } from '../../../supabase/functions/_shared/guest.ts'

// Guests (D125, F-PLAN-06): which address a guest is counted by, that a client can't pick another
// one, and that only a keyed hash of it leaves the function.

const SECRET = 'guest-secret-for-tests-0123456789abcdef'
const headers = (values: Record<string, string>) => new Headers(values)

describe('guestSubject', () => {
  it.each([
    ['203.0.113.7', '4:203.0.113.7'],
    [' 203.0.113.7 ', '4:203.0.113.7'],
    // IPv6 counts by its /64: every address one connection is given is the same guest.
    ['2001:db8:0:1:aaaa:bbbb:cccc:dddd', '6:2001:db8:0:1'],
    ['2001:0DB8:0000:0001:0:0:0:1', '6:2001:db8:0:1'],
    ['2001:db8:0:1::42', '6:2001:db8:0:1'],
    ['2001:db8::', '6:2001:db8:0:0'],
    ['[2001:db8::1]', '6:2001:db8:0:0'],
    ['fe80::1%en0', '6:fe80:0:0:0'],
    ['::', '6:0:0:0:0'],
    // An IPv4 address written as IPv6 is itself.
    ['::ffff:203.0.113.7', '4:203.0.113.7'],
    ['::ffff:cb00:7107', '4:203.0.113.7'],
  ])('%s → %s', (address, subject) => {
    expect(guestSubject(address)).toBe(subject)
  })

  it.each([
    '',
    'spoofed',
    '256.1.1.1',
    '1.2.3',
    '2001:db8::1::2',
    '2001:db8:0:1:2:3:4:5:6',
    'g::1',
  ])('refuses %j', (address) => {
    expect(guestSubject(address)).toBeNull()
  })
})

describe('clientAddress', () => {
  it('takes the address the edge saw, not one the client claims', () => {
    expect(
      clientAddress(
        headers({
          'cf-connecting-ip': '198.51.100.4',
          'x-forwarded-for': '10.0.0.1, 198.51.100.4',
        }),
      ),
    ).toBe('198.51.100.4')
    // Without the edge's header: the last forwarded entry (the proxy's), never the first.
    expect(clientAddress(headers({ 'x-forwarded-for': 'spoofed, 10.9.9.9, 198.51.100.4' }))).toBe(
      '198.51.100.4',
    )
    expect(
      clientAddress(headers({ 'cf-connecting-ip': 'junk', 'x-forwarded-for': '198.51.100.4' })),
    ).toBe('198.51.100.4')
    expect(clientAddress(headers({ 'x-forwarded-for': '198.51.100.4, junk' }))).toBeNull()
    expect(clientAddress(headers({}))).toBeNull()
  })
})

describe('guestKey', () => {
  it('is a keyed hash: stable per guest, different per guest and per secret', async () => {
    const key = await guestKey(headers({ 'cf-connecting-ip': '203.0.113.7' }), SECRET)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('203')
    // A client's forwarded-for claims don't change who they are.
    const claimed = await guestKey(
      headers({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1' }),
      SECRET,
    )
    expect(claimed).toBe(key)
    expect(await guestKey(headers({ 'cf-connecting-ip': '203.0.113.8' }), SECRET)).not.toBe(key)
    expect(await guestKey(headers({ 'cf-connecting-ip': '203.0.113.7' }), `${SECRET}x`)).not.toBe(
      key,
    )
    // One IPv6 /64 is one guest.
    const a = await guestKey(headers({ 'cf-connecting-ip': '2001:db8:0:1::1' }), SECRET)
    const b = await guestKey(headers({ 'cf-connecting-ip': '2001:db8:0:1:ffff::9' }), SECRET)
    expect(a).toBe(b)
    expect(await guestKey(headers({}), SECRET)).toBeNull()
  })
})
