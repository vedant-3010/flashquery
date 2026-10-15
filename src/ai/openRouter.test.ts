// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { exchangeOpenRouterCode, openRouterAuthUrl, usableModels } from '@/ai/openRouter'

// The user's own OpenRouter account (F-AI-07): connecting it, and which models it offers.

describe('OpenRouter', () => {
  it('asks OpenRouter for a key with a PKCE challenge, and comes back to us', () => {
    const url = new URL(openRouterAuthUrl('https://hushglance.app/app/connect/openrouter', 'abc'))
    expect(url.origin).toBe('https://openrouter.ai')
    expect(url.pathname).toBe('/auth')
    expect(url.searchParams.get('callback_url')).toBe(
      'https://hushglance.app/app/connect/openrouter',
    )
    expect(url.searchParams.get('code_challenge')).toBe('abc')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('trades the code and verifier for the key', async () => {
    let sent: unknown
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return Response.json({ key: 'sk-or-v1-new-key-123' })
    }) as unknown as typeof fetch
    expect(await exchangeOpenRouterCode('code-1', 'verifier-1', fetcher)).toBe(
      'sk-or-v1-new-key-123',
    )
    expect(sent).toEqual({
      code: 'code-1',
      code_verifier: 'verifier-1',
      code_challenge_method: 'S256',
    })
    const refused = (async () =>
      Response.json({ error: 'bad' }, { status: 403 })) as unknown as typeof fetch
    await expect(exchangeOpenRouterCode('x', 'y', refused)).rejects.toMatchObject({
      code: 'openrouter_connect',
    })
  })

  it('lists only models with structured outputs on a zero-retention endpoint', () => {
    const models = {
      data: [
        {
          id: 'anthropic/claude-sonnet-5',
          name: 'Claude Sonnet 5',
          supported_parameters: ['structured_outputs'],
          pricing: { prompt: '0.000002', completion: '0.00001' },
        },
        {
          id: 'acme/no-zdr',
          name: 'No ZDR',
          supported_parameters: ['structured_outputs'],
          pricing: {},
        },
        { id: 'acme/no-json', name: 'No JSON', supported_parameters: ['tools'], pricing: {} },
        {
          id: 'acme/free:free',
          name: 'Free',
          supported_parameters: ['structured_outputs'],
          pricing: {},
        },
      ],
    }
    const zdr = {
      data: [
        { model_id: 'anthropic/claude-sonnet-5', supported_parameters: ['structured_outputs'] },
        { model_id: 'acme/no-json', supported_parameters: ['structured_outputs'] },
        { model_id: 'acme/free:free', supported_parameters: ['structured_outputs'] },
      ],
    }
    expect(usableModels(models, zdr)).toEqual([
      {
        id: 'anthropic/claude-sonnet-5',
        name: 'Claude Sonnet 5',
        inputPerMTok: 2,
        outputPerMTok: 10,
      },
    ])
    expect(usableModels({ nope: true }, zdr)).toEqual([])
  })
})
