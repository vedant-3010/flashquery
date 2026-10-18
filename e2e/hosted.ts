import type { Page, Route } from '@playwright/test'
import { SUPABASE_URL } from './supabase.ts'

// HushGlance AI for e2e (F-PLAN, M16): the hosted model list, the plans, ai_quota, the `ai` proxy
// (OpenAI chat-completions shape, as OpenRouter answers) and the billing function, with the quota
// rules of supabase/migrations/…_plans.sql in miniature (the real ones are tested in Postgres).
// Register after signIn(): Playwright tries the last route first.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'x-fq-remaining',
}

export const HOSTED_MODELS = [
  {
    id: 'anthropic/claude-sonnet-5',
    label: 'Claude Sonnet 5',
    maker: 'Anthropic',
    description: 'Careful SQL at a good pace. The default.',
    tier: 'standard',
    weight: 1,
  },
  {
    id: 'openai/gpt-6-sol',
    label: 'GPT-6 Sol',
    maker: 'OpenAI',
    description: 'Balanced intelligence and cost.',
    tier: 'standard',
    weight: 1,
  },
  {
    id: 'anthropic/claude-opus-5.5',
    label: 'Claude Opus 5.5',
    maker: 'Anthropic',
    description: 'Most capable Claude, for the hardest questions.',
    tier: 'premium',
    weight: 5,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    maker: 'Anthropic',
    description: 'Writes summaries and suggestions.',
    tier: 'fast',
    weight: 1,
  },
  {
    id: 'openai/gpt-6-luna',
    label: 'GPT-6 Luna',
    maker: 'OpenAI',
    description: 'Writes summaries and suggestions.',
    tier: 'fast',
    weight: 1,
  },
]

const PLANS = [
  {
    id: 'free',
    label: 'Free',
    questions: 3,
    period: 'lifetime',
    tiers: ['standard'],
    price_monthly_usd: null,
    price_yearly_usd: null,
    storage_bytes: 500000000,
  },
  {
    id: 'starter',
    label: 'Starter',
    questions: 100,
    period: 'month',
    tiers: ['standard'],
    price_monthly_usd: 5,
    price_yearly_usd: 50,
    storage_bytes: 5000000000,
  },
  {
    id: 'pro',
    label: 'Pro',
    questions: 300,
    period: 'month',
    tiers: ['standard', 'premium'],
    price_monthly_usd: 12,
    price_yearly_usd: 120,
    storage_bytes: 25000000000,
  },
]

type Plan = 'free' | 'starter' | 'pro'

export interface HostedCall {
  question: string
  kind: string
  body: {
    model: string
    messages: { role: string; content: unknown }[]
    provider?: unknown
    response_format?: { json_schema?: { name?: string } }
  }
  headers: Record<string, string>
}

export interface MockHosted {
  plan: Plan
  /** Question ids charged so far, with their units. */
  questions: Map<string, number>
  calls: HostedCall[]
  checkouts: unknown[]
  portals: number
  /** Where checkout sends the browser. */
  checkoutUrl: string
}

/** A plan for any question about the sample (sum of revenue by region). */
const PLAN = {
  kind: 'sql',
  title: 'Revenue by region',
  sql: 'SELECT region, round(sum(revenue), 2) AS total_revenue FROM global_sales GROUP BY ALL ORDER BY total_revenue DESC',
  python: null,
  explanation: 'Adds up revenue for each region.',
  assumptions: ['Revenue is the revenue column.'],
  tablesUsed: ['global_sales'],
  columnsUsed: ['global_sales.region', 'global_sales.revenue'],
  clarification: null,
  alternatives: [],
  chartHint: { type: 'bar', x: 'region', y: ['total_revenue'], series: null },
}

const SUMMARY = {
  headline: 'North America leads revenue across regions.',
  bullets: ['Hosted summary from HushGlance AI.'],
  caveats: [],
}

function completion(model: string, content: unknown) {
  return {
    id: 'gen-e2e',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: JSON.stringify(content), refusal: null },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1200, completion_tokens: 200, total_tokens: 1400, cost: 0.004 },
  }
}

export async function mockHosted(
  page: Page,
  { plan = 'free', used = 0 }: { plan?: Plan; used?: number } = {},
): Promise<MockHosted> {
  const state: MockHosted = {
    plan,
    questions: new Map(Array.from({ length: used }, (_, i) => [`used-${i}`, 1])),
    calls: [],
    checkouts: [],
    portals: 0,
    checkoutUrl: 'https://test.checkout.dodopayments.com/session/cks_e2e',
  }
  const LIMITS: Record<Plan, number> = { free: 3, starter: 100, pro: 300 }
  const LABELS: Record<Plan, string> = { free: 'Free', starter: 'Starter', pro: 'Pro' }
  const limit = () => LIMITS[state.plan]
  const paid = () => state.plan !== 'free'
  const usedUnits = () => [...state.questions.values()].reduce((sum, units) => sum + units, 0)
  const remaining = () => Math.max(limit() - usedUnits(), 0)
  const json = (
    route: Route,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    route.fulfill({
      status,
      headers: { ...CORS, ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  const quota = () => ({
    plan: state.plan,
    label: LABELS[state.plan],
    questions: limit(),
    period: paid() ? 'month' : 'lifetime',
    used: usedUnits(),
    remaining: remaining(),
    tiers: state.plan === 'pro' ? ['standard', 'premium'] : ['standard'],
    renews_at: paid() ? '2026-11-12T10:00:00+00:00' : null,
    status: paid() ? 'active' : null,
    has_customer: paid(),
  })

  await page.route(`${SUPABASE_URL}/rest/v1/ai_models*`, (route) => json(route, 200, HOSTED_MODELS))
  await page.route(`${SUPABASE_URL}/rest/v1/plans*`, (route) => json(route, 200, PLANS))
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/ai_quota`, (route) => json(route, 200, quota()))

  await page.route(`${SUPABASE_URL}/functions/v1/ai/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const headers = request.headers()
    const body = JSON.parse(request.postData() ?? '{}') as HostedCall['body']
    const question = headers['x-fq-question'] ?? ''
    state.calls.push({ question, kind: headers['x-fq-kind'] ?? '', body, headers })
    const model = HOSTED_MODELS.find((m) => m.id === body.model)
    const refuse = (status: number, code: string, message: string) =>
      json(
        route,
        status,
        { error: { code, message, remaining: remaining() } },
        { 'x-fq-remaining': String(remaining()) },
      )
    if (!model) return refuse(403, 'model_unknown', 'Unknown model.')
    if (!state.questions.has(question)) {
      const allowed =
        model.tier === 'standard' || (model.tier === 'premium' && state.plan === 'pro')
      if (!allowed && !(model.tier === 'fast' && headers['x-fq-kind'] === 'suggest')) {
        return refuse(403, 'model_not_in_plan', 'That model is part of Pro.')
      }
      if (usedUnits() + model.weight > limit()) {
        return refuse(402, 'quota_reached', 'You’ve used your hosted questions.')
      }
      state.questions.set(question, model.weight)
    }
    const schema = body.response_format?.json_schema?.name
    const content =
      schema === 'answer_summary'
        ? SUMMARY
        : schema === 'suggested_questions'
          ? { questions: ['Which region sells the most?'] }
          : PLAN
    return json(route, 200, completion(model.id, content), {
      'x-fq-remaining': String(remaining()),
    })
  })

  await page.route(`${SUPABASE_URL}/functions/v1/billing/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/checkout')) {
      const body = JSON.parse(request.postData() ?? '{}') as { plan?: Plan; interval?: string }
      state.checkouts.push(body)
      // Already subscribed: Dodo changes the plan in place (prorated), and the webhook lands.
      if (paid() && body.plan && body.plan !== state.plan) {
        state.plan = body.plan
        return json(route, 200, { changed: true })
      }
      return json(route, 200, { url: state.checkoutUrl })
    }
    state.portals += 1
    return json(route, 200, { url: 'https://customer.dodopayments.com/portal/e2e' })
  })
  // Dodo's pages: a stand-in, so leaving for checkout can be checked without the network.
  await page.route('https://*.dodopayments.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><title>Dodo checkout</title><h1>Dodo test checkout</h1>',
    }),
  )
  return state
}
