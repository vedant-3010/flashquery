// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { PromptMessage } from '@/ai/prompts/planSql'
import type { SqlPlan } from '@/ai/schemas'
import { createProvider } from '@/ai/providers'

// The real LangChain + SDK code path with a fake network: checks exactly what is sent and how the
// reply is parsed. (A live call with a real key is a manual check; see the M3 notes.)

const plan: SqlPlan = {
  kind: 'sql',
  title: 'Revenue by region',
  sql: 'SELECT region, sum(revenue) AS total_revenue FROM global_sales GROUP BY ALL',
  python: null,
  explanation: 'Adds up revenue per region.',
  assumptions: [],
  tablesUsed: ['global_sales'],
  columnsUsed: ['global_sales.region', 'global_sales.revenue'],
  clarification: null,
  alternatives: [],
  chartHint: { type: 'bar', x: 'region', y: ['total_revenue'], series: null },
}

const messages: PromptMessage[] = [
  { role: 'system', content: 'STATIC INSTRUCTIONS', cache: true },
  { role: 'system', content: '<data>\n{"name":"global_sales"}\n</data>', cache: true },
  { role: 'user', content: 'Question: Revenue by region?' },
]

interface Captured {
  url: string
  headers: Headers
  body: Record<string, unknown>
}

function fakeFetch(respond: (request: Captured) => Response) {
  const calls: Captured[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const captured: Captured = {
      url: request.url,
      headers: request.headers,
      body: JSON.parse(await request.text()) as Record<string, unknown>,
    }
    calls.push(captured)
    init?.signal?.throwIfAborted()
    return respond(captured)
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const anthropicReply = json({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5',
  content: [{ type: 'text', text: JSON.stringify(plan) }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 200,
    output_tokens: 150,
    cache_read_input_tokens: 1800,
    cache_creation_input_tokens: 0,
  },
})

const KEY = 'sk-ant-api03-test-key-1234567890'

describe('Anthropic provider', () => {
  it('sends native structured output with cache breakpoints, and parses the plan', async () => {
    const { fetch, calls } = fakeFetch(() => anthropicReply.clone())
    const provider = await createProvider({
      provider: 'anthropic',
      apiKey: KEY,
      model: 'claude-sonnet-5',
      fetch,
    })
    const response = await provider.planSql({ question: 'q', messages, tables: ['global_sales'] })

    expect(response.plan).toEqual(plan)
    expect(response.usage).toMatchObject({ outputTokens: 150, cacheReadTokens: 1800 })

    const [call] = calls
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(call?.headers.get('x-api-key')).toBe(KEY)
    const body = call?.body ?? {}
    expect(body.model).toBe('claude-sonnet-5')
    expect(body.max_tokens).toBe(16_000)
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('tool_choice')
    expect(body.output_config).toMatchObject({
      effort: 'medium',
      format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false } },
    })
    expect(body.system).toEqual([
      { type: 'text', text: 'STATIC INSTRUCTIONS', cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: '<data>\n{"name":"global_sales"}\n</data>',
        cache_control: { type: 'ephemeral' },
      },
    ])
    expect(body.messages).toEqual([{ role: 'user', content: 'Question: Revenue by region?' }])
    // The key travels only in the header.
    expect(JSON.stringify(body)).not.toContain(KEY)
  })

  it('does not send effort to models that reject it (Haiku 4.5)', async () => {
    const { fetch, calls } = fakeFetch(() => anthropicReply.clone())
    const provider = await createProvider({
      provider: 'anthropic',
      apiKey: KEY,
      model: 'claude-haiku-4-5-20251001',
      fetch,
    })
    await provider.planSql({ question: 'q', messages, tables: [] })
    expect(calls[0]?.body.output_config).toEqual({
      format: expect.objectContaining({ type: 'json_schema' }),
    })
  })

  it('maps HTTP errors to actionable messages', async () => {
    for (const [status, code] of [
      [401, 'ai_auth'],
      [404, 'ai_model'],
      [429, 'ai_rate_limit'],
      [529, 'ai_unavailable'],
    ] as const) {
      const { fetch } = fakeFetch(() =>
        json({ type: 'error', error: { type: 'error', message: 'nope' } }, status),
      )
      const provider = await createProvider({
        provider: 'anthropic',
        apiKey: KEY,
        model: 'claude-sonnet-5',
        fetch,
      })
      await expect(provider.planSql({ question: 'q', messages, tables: [] })).rejects.toMatchObject(
        { code },
      )
    }
  }, 30_000)

  it('reports a reply that is not a valid plan', async () => {
    const { fetch } = fakeFetch(() =>
      json({
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: '{"kind":"sql"}' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    )
    const provider = await createProvider({
      provider: 'anthropic',
      apiKey: KEY,
      model: 'claude-sonnet-5',
      fetch,
    })
    await expect(provider.planSql({ question: 'q', messages, tables: [] })).rejects.toMatchObject({
      code: 'ai_bad_output',
    })
  })

  it('cancels with the signal', async () => {
    const { fetch } = fakeFetch(() => anthropicReply.clone())
    const provider = await createProvider({
      provider: 'anthropic',
      apiKey: KEY,
      model: 'claude-sonnet-5',
      fetch,
    })
    const controller = new AbortController()
    controller.abort()
    await expect(
      provider.planSql({ question: 'q', messages, tables: [], signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' })
  })
})

describe('OpenAI provider', () => {
  it('sends a strict JSON schema and parses the plan', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 0,
        model: 'gpt-6-sol',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(plan), refusal: null },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 },
      }),
    )
    const provider = await createProvider({
      provider: 'openai',
      apiKey: 'sk-proj-test-1234567890abcdef',
      model: 'gpt-6-sol',
      fetch,
    })
    const response = await provider.planSql({ question: 'q', messages, tables: [] })

    expect(response.plan).toEqual(plan)
    expect(response.usage).toMatchObject({ inputTokens: 900, outputTokens: 120 })
    const body = calls[0]?.body ?? {}
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(body.model).toBe('gpt-6-sol')
    expect(body).not.toHaveProperty('temperature')
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'sql_plan', strict: true },
    })
    expect(body.reasoning_effort).toBe('medium')
  })
})

const summary = {
  headline: 'APAC leads with 137.9M in revenue.',
  bullets: ['LATAM is second.'],
  caveats: [],
}
const summaryMessages: PromptMessage[] = [
  { role: 'system', content: 'SUMMARY INSTRUCTIONS' },
  { role: 'user', content: 'Question: q\n<data>\n{"rowCount":1}\n</data>' },
]

describe('AI summaries (F-ASK-12)', () => {
  it('Anthropic: the fast model, a JSON schema, no effort for Haiku', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        id: 'msg_s',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: JSON.stringify(summary) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 400, output_tokens: 60 },
      }),
    )
    const provider = await createProvider({
      provider: 'anthropic',
      apiKey: KEY,
      model: 'claude-opus-5',
      fetch,
    })
    expect(provider.summaryModel).toBe('claude-haiku-4-5-20251001')
    const response = await provider.summarize?.({ messages: summaryMessages })
    expect(response?.summary).toEqual(summary)
    const body = calls[0]?.body ?? {}
    expect(body.model).toBe('claude-haiku-4-5-20251001')
    expect(body.max_tokens).toBe(2_000)
    expect(body.output_config).toEqual({ format: expect.objectContaining({ type: 'json_schema' }) })
    expect(body.system).toBe('SUMMARY INSTRUCTIONS')
    expect(JSON.stringify(body)).not.toContain(KEY)
  })

  it('OpenAI: the fast model with low reasoning effort and a strict schema', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({
        id: 'chatcmpl-s',
        object: 'chat.completion',
        created: 0,
        model: 'gpt-6-luna',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(summary), refusal: null },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 300, completion_tokens: 50, total_tokens: 350 },
      }),
    )
    const provider = await createProvider({
      provider: 'openai',
      apiKey: 'sk-proj-test-1234567890abcdef',
      model: 'gpt-6-sol',
      fetch,
    })
    const response = await provider.summarize?.({ messages: summaryMessages })
    expect(response?.summary).toEqual(summary)
    const body = calls[0]?.body ?? {}
    expect(body.model).toBe('gpt-6-luna')
    expect(body.reasoning_effort).toBe('low')
    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'answer_summary', strict: true },
    })
  })
})

describe('dashboard plans (F-DASH-09)', () => {
  it('Anthropic: the chosen model, a JSON schema and cache breakpoints', async () => {
    const dashboard = {
      title: 'Overview',
      tiles: [
        { title: 'Orders', sql: 'SELECT count(*) AS n FROM t', chartHint: null, size: 'kpi' },
      ],
    }
    const { fetch, calls } = fakeFetch(() =>
      json({
        id: 'msg_d',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: JSON.stringify(dashboard) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 300 },
      }),
    )
    const provider = await createProvider({
      provider: 'anthropic',
      apiKey: KEY,
      model: 'claude-sonnet-5',
      fetch,
    })
    const response = await provider.planDashboard({ messages, table: 't' })
    expect(response.plan).toEqual(dashboard)
    const body = calls[0]?.body ?? {}
    expect(body.model).toBe('claude-sonnet-5')
    expect(body.output_config).toMatchObject({ format: { type: 'json_schema' } })
    expect(body.system).toEqual([
      expect.objectContaining({ cache_control: { type: 'ephemeral' } }),
      expect.objectContaining({ cache_control: { type: 'ephemeral' } }),
    ])
  })
})
