// Guests (PRD D125, F-PLAN-06): who a guest is for counting free questions, without keeping who
// they are. Their IP address becomes a keyed hash (HMAC-SHA256 with GUEST_KEY_SECRET, a function
// secret), so the database holds no address and can't be turned back into one without the
// secret. An IPv6 address counts by its /64, the block one connection gets: rotating through it
// buys nothing. Plain TypeScript with no Deno imports (unit-tested from src/test/edge/).

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** An IPv6 address as its eight 16-bit groups, or null when it isn't one. */
function ipv6Groups(address: string): number[] | null {
  let text =
    address
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .split('%')[0] ?? ''
  // An IPv4 tail (::ffff:203.0.113.7) is the last two groups.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1]
  if (tail) {
    if (!IPV4.test(tail)) return null
    const [a = 0, b = 0, c = 0, d = 0] = tail.split('.').map(Number)
    text = `${text.slice(0, -tail.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const split = (part: string) => (part === '' ? [] : part.split(':'))
  const head = split(halves[0] ?? '')
  const rest = halves.length === 2 ? split(halves[1] ?? '') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => parseInt(group, 16))
}

/**
 * What a guest is counted by: "4:203.0.113.7", or "6:2001:db8:0:1" (the /64). An IPv4 address
 * written as IPv6 (::ffff:203.0.113.7) counts as itself. Null when it isn't an address.
 */
export function guestSubject(address: string): string | null {
  const trimmed = address.trim()
  if (IPV4.test(trimmed)) return `4:${trimmed}`
  const groups = ipv6Groups(trimmed)
  if (!groups) return null
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (mapped) {
    const [high = 0, low = 0] = groups.slice(6)
    return `4:${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
  }
  return `6:${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}`
}

/**
 * The client's address, as the platform saw it. Supabase's edge (Cloudflare) sets
 * `cf-connecting-ip` itself, whatever the client sent. Without it, the last `x-forwarded-for`
 * entry: proxies add the address they saw at the end, while anything before it is the client's
 * own claim (the first entry can be spoofed). If that ever named a proxy, guests would share one
 * allowance (too strict, never too loose).
 */
export function clientAddress(headers: Headers): string | null {
  const direct = headers.get('cf-connecting-ip')?.trim()
  if (direct && guestSubject(direct)) return direct
  const forwarded = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const last = forwarded.at(-1)
  return last && guestSubject(last) ? last : null
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

/** The guest's key: HMAC-SHA256(secret, subject), 64 hex characters. Null without an address. */
export async function guestKey(headers: Headers, secret: string): Promise<string | null> {
  const address = clientAddress(headers)
  const subject = address ? guestSubject(address) : null
  if (!subject) return null
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`hushglance-guest:v1:${subject}`)),
  )
}
