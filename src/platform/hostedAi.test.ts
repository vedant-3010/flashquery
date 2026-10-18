import { afterEach, describe, expect, it, vi } from 'vitest'

// HushGlance AI's fetch (F-PLAN-01, D119): only our function, only the session, the publishable key
// and the meter; never a key or any other header from the SDK. What's left and refusals reach the
// plan store.

let session: { access_token: string } | null = { access_token: 'user-jwt' }
vi.mock('@/platform/supabase', () => ({
  accountClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }),
}))
vi.mock('@/platform/config', () => ({
  accountsConfig: () => ({
    url: 'https://example.supabase.co',
    key: 'sb_publishable_test',
    storageKey: 'sb-example-auth-token',
  }),
}))

const { hostedFetch } = await import('@/platform/hostedAi')
const BASE = 'https://example.supabase.co/functions/v1/ai/v1'

afterEach(() => {
  vi.unstubAllGlobals()
  session = { access_token: 'user-jwt' }
})

function stubNetwork(response: Response) {
  const network = vi.fn(async (_url: string, _init: RequestInit) => response)
  vi.stubGlobal('fetch', network)
  return network
}

describe('hostedFetch', () => {
  it('sends the session, the meter and the body, and drops every other header', async () => {
    const network = stubNetwork(
      new Response('{}', { status: 200, headers: { 'x-fq-remaining': '2' } }),
    )
    const onRemaining = vi.fn()
    const fetcher = hostedFetch(
      BASE,
      { id: 'meter-0001', kind: 'ask' },
      {
        onRemaining,
        onRefusal: vi.fn(),
      },
    )
    await fetcher(`${BASE}/chat/completions`, {
      method: 'POST',
      body: '{"model":"anthropic/claude-sonnet-5"}',
      headers: {
        authorization: 'Bearer hushglance-hosted',
        'x-stainless-os': 'MacOS',
        'openai-organization': 'org-1',
      },
    })
    const [url, init] = network.mock.calls[0]!
    expect(url).toBe(`${BASE}/chat/completions`)
    expect(init.headers).toEqual({
      authorization: 'Bearer user-jwt',
      apikey: 'sb_publishable_test',
      'content-type': 'application/json',
      'x-fq-question': 'meter-0001',
      'x-fq-kind': 'ask',
    })
    expect(init.body).toBe('{"model":"anthropic/claude-sonnet-5"}')
    expect(onRemaining).toHaveBeenCalledWith(2)
  })

  it('tells the plan store about a refusal for the plan', async () => {
    stubNetwork(Response.json({ error: { code: 'quota_reached', message: 'no' } }, { status: 402 }))
    const onRefusal = vi.fn()
    await hostedFetch(
      BASE,
      { id: 'meter-0002', kind: 'ask' },
      { onRemaining: vi.fn(), onRefusal },
    )(`${BASE}/chat/completions`, { body: '{}' })
    expect(onRefusal).toHaveBeenCalledWith('quota_reached')
  })

  it('answers "signed out" itself, and never calls anything but our function', async () => {
    const network = stubNetwork(new Response('{}'))
    const fetcher = hostedFetch(
      BASE,
      { id: 'meter-0003', kind: 'ask' },
      {
        onRemaining: vi.fn(),
        onRefusal: vi.fn(),
      },
    )
    session = null
    const response = await fetcher(`${BASE}/chat/completions`, { body: '{}' })
    expect(response.status).toBe(401)
    expect(network).not.toHaveBeenCalled()
    await expect(fetcher('https://openrouter.ai/api/v1/chat/completions', {})).rejects.toThrow()
  })
})
