// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  checkChatRequest,
  FORCED_PROVIDER,
  handleAi,
  MAX_OUTPUT_TOKENS,
  parseUsage,
  pseudonym,
  type AiDeps,
} from '../../../supabase/functions/_shared/aiProxy.ts'
import type { Rest } from '../../../supabase/functions/_shared/rest.ts'

// The hosted AI proxy (F-PLAN-01, D119): what it lets through, what it forces, what it records and
// what it never logs. The quota rules themselves are pgTAP-tested (supabase/tests/plans.test.sql).

const ORIGIN = 'https://hushglance.app'
const USER = { id: '00000000-0000-0000-0000-0000000000f1', email: 'fran@example.com' }

const chat = (extra: Record<string, unknown> = {}) => ({
  model: 'anthropic/claude-sonnet-5',
  messages: [
    { role: 'system', content: 'You write DuckDB SQL.' },
    { role: 'user', content: 'Revenue by region? <data>SECRET_CELL_VALUE</data>' },
  ],
  response_format: { type: 'json_schema', json_schema: { name: 'sql_plan', strict: true } },
  ...extra,
})

const ALLOWED = {
  allowed: true,
  reason: 'ok',
  plan: 'free',
  remaining: 2,
  usage_id: 41,
  input_per_mtok: 2,
  output_per_mtok: 10,
}

function setup({
  begin = ALLOWED as Record<string, unknown>,
  upstream = () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"kind":"sql"}' } }],
        usage: {
          prompt_tokens: 3600,
          completion_tokens: 400,
          prompt_tokens_details: { cached_tokens: 3000 },
          cost: 0.0112,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  user = USER as typeof USER | null,
} = {}) {
  const rpc = vi.fn(async (name: string) => (name === 'ai_begin' ? begin : null))
  const rest: Rest = { user: vi.fn(async () => user), rpc, selectOne: vi.fn(async () => null) }
  const fetch = vi.fn(async () => upstream())
  const logs: string[] = []
  const deps: AiDeps = {
    config: {
      openRouterKey: 'sk-or-SERVER-KEY',
      upstreamUrl: 'https://openrouter.ai/api/v1/chat/completions',
      appOrigins: [ORIGIN],
      dailyBudgetUsd: 20,
    },
    rest,
    fetch: fetch as unknown as typeof globalThis.fetch,
    log: (line) => logs.push(line),
  }
  return { deps, rpc, fetch, logs }
}

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x.supabase.co/functions/v1/ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      authorization: 'Bearer user-jwt',
      'content-type': 'application/json',
      'x-fq-question': 'q-0123456789',
      'x-fq-kind': 'ask',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const sentBody = (fetch: ReturnType<typeof setup>['fetch']) => {
  const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

describe('checkChatRequest', () => {
  it('forces zero data retention and our caps, whatever the client sent', () => {
    const checked = checkChatRequest(
      chat({
        provider: { zdr: false, data_collection: 'allow', order: ['somewhere'] },
        max_tokens: 200_000,
        plugins: [{ id: 'web' }],
        models: ['openai/gpt-6-astra'],
        route: 'fallback',
        user: 'someone-else',
        reasoning: { effort: 'high', max_tokens: 90_000 },
      }),
    )
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    expect(checked.body.provider).toEqual(FORCED_PROVIDER)
    expect(checked.body.max_tokens).toBe(MAX_OUTPUT_TOKENS)
    expect(checked.body.reasoning).toEqual({ effort: 'high' })
    expect(checked.body.usage).toEqual({ include: true })
    for (const key of ['plugins', 'models', 'route', 'user'])
      expect(checked.body).not.toHaveProperty(key)
  })

  it('caps output tokens when none are asked for', () => {
    const checked = checkChatRequest(chat())
    expect(checked.ok && checked.body.max_tokens).toBe(MAX_OUTPUT_TOKENS)
    const reasoning = checkChatRequest(chat({ max_completion_tokens: 500 }))
    expect(reasoning.ok && reasoning.body.max_completion_tokens).toBe(500)
  })

  it.each([
    ['no model', { messages: [{ role: 'user', content: 'x' }] }],
    ['no messages', { model: 'anthropic/claude-sonnet-5', messages: [] }],
    ['streaming', chat({ stream: true })],
    ['a built-in tool', chat({ tools: [{ type: 'web_search' }] })],
    ['several answers', chat({ n: 3 })],
  ])('refuses %s', (_, body) => {
    expect(checkChatRequest(body).ok).toBe(false)
  })
})

describe('parseUsage', () => {
  it('reads tokens and the cost OpenRouter reports', () => {
    const text = JSON.stringify({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 100,
        prompt_tokens_details: { cached_tokens: 800 },
        cost: 0.004,
      },
    })
    expect(parseUsage(text, { inputPerMTok: 2, outputPerMTok: 10 })).toEqual({
      inputTokens: 1000,
      outputTokens: 100,
      cacheReadTokens: 800,
      costUsd: 0.004,
    })
  })

  it('prices the call from the table when no cost is reported, and survives non-JSON', () => {
    const text = JSON.stringify({ usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } })
    expect(parseUsage(text, { inputPerMTok: 2, outputPerMTok: 10 }).costUsd).toBe(2)
    expect(parseUsage('<html>bad gateway</html>', { inputPerMTok: 2, outputPerMTok: 10 })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
    })
  })
})

describe('handleAi', () => {
  it('answers a preflight only for the app’s origins', async () => {
    const { deps } = setup()
    const ok = await handleAi(
      new Request('https://x/ai/v1/chat/completions', {
        method: 'OPTIONS',
        headers: { origin: ORIGIN },
      }),
      deps,
    )
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(ok.headers.get('access-control-allow-headers')).toContain('x-fq-question')
    const other = await handleAi(
      new Request('https://x/ai/v1/chat/completions', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
      deps,
    )
    expect(other.status).toBe(403)
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('needs a signed-in user', async () => {
    const { deps, rpc, fetch } = setup({ user: null })
    const response = await handleAi(request(chat()), deps)
    expect(response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('checks the quota, forwards with the server key and ZDR, and records usage', async () => {
    const { deps, rpc, fetch } = setup()
    const response = await handleAi(request(chat({ provider: { zdr: false } })), deps)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-fq-remaining')).toBe('2')
    expect(response.headers.get('access-control-expose-headers')).toBe('x-fq-remaining')
    expect(await response.json()).toMatchObject({
      choices: [{ message: { content: '{"kind":"sql"}' } }],
    })

    expect(rpc).toHaveBeenNthCalledWith(1, 'ai_begin', {
      person: USER.id,
      question: 'q-0123456789',
      kind: 'ask',
      model: 'anthropic/claude-sonnet-5',
      daily_budget: 20,
    })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-or-SERVER-KEY')
    const body = sentBody(fetch)
    expect(body.provider).toEqual(FORCED_PROVIDER)
    // A pseudonym for abuse checks: never the user's id or email.
    expect(body.user).toBe(await pseudonym(USER.id))
    expect(JSON.stringify(body)).not.toContain(USER.id)
    expect(JSON.stringify(body)).not.toContain(USER.email)

    expect(rpc).toHaveBeenNthCalledWith(2, 'ai_finish', {
      usage: 41,
      input_tokens: 3600,
      output_tokens: 400,
      cache_read_tokens: 3000,
      cost: 0.0112,
      upstream_status: 200,
    })
  })

  it.each([
    ['quota_reached', 402],
    ['model_not_in_plan', 403],
    ['email_unconfirmed', 403],
    ['rate_limited', 429],
    ['call_cap', 429],
    ['hosted_paused', 503],
  ])('turns a %s refusal into %i, without calling the model', async (reason, status) => {
    const { deps, fetch } = setup({ begin: { allowed: false, reason, remaining: 0 } })
    const response = await handleAi(request(chat()), deps)
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ error: { code: reason, remaining: 0 } })
    expect(response.headers.get('x-fq-remaining')).toBe('0')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a request without a question id, or too large, before metering', async () => {
    const { deps, rpc } = setup()
    expect((await handleAi(request(chat(), { 'x-fq-question': 'x' }), deps)).status).toBe(400)
    const huge = chat({ messages: [{ role: 'user', content: 'x'.repeat(300_000) }] })
    expect((await handleAi(request(huge), deps)).status).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reports our own upstream trouble as ours, not as the user’s key or quota', async () => {
    const { deps, rpc } = setup({
      upstream: () => new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 }),
    })
    const response = await handleAi(request(chat()), deps)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'hosted_unavailable' } })
    // The failed call is recorded with its status (ai_finish gives the question back).
    expect(rpc).toHaveBeenLastCalledWith(
      'ai_finish',
      expect.objectContaining({ upstream_status: 402 }),
    )
  })

  it('never logs a prompt, an answer or the server key', async () => {
    const { deps, logs } = setup()
    await handleAi(request(chat()), deps)
    const { deps: refused, logs: refusedLogs } = setup({
      begin: { allowed: false, reason: 'quota_reached', remaining: 0 },
    })
    await handleAi(request(chat()), refused)
    const all = [...logs, ...refusedLogs].join('\n')
    expect(all).not.toContain('SECRET_CELL_VALUE')
    expect(all).not.toContain('kind')
    expect(all).not.toContain('sk-or-')
    expect(all).not.toContain(USER.id)
    expect(logs).toEqual([expect.stringMatching(/^ai 200 anthropic\/claude-sonnet-5 \d+ms$/)])
  })
})
