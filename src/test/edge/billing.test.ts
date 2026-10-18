// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  handleBilling,
  signWebhook,
  subscriptionChange,
  timingSafeEqual,
  verifyWebhook,
  type BillingDeps,
} from '../../../supabase/functions/_shared/billing.ts'
import { readAiConfig, readBillingConfig } from '../../../supabase/functions/_shared/config.ts'
import type { Rest } from '../../../supabase/functions/_shared/rest.ts'
import {
  originsFrom,
  serviceKeyFrom,
  supabaseRest,
} from '../../../supabase/functions/_shared/rest.ts'

// Pro through Dodo Payments (F-PLAN-03, D120): Standard Webhooks signatures, which events change a
// subscription, and the hosted checkout and portal.

const SECRET = `whsec_${btoa('a-test-signing-secret-of-32-bytes!')}`
const NOW = Date.parse('2026-10-12T10:00:00Z')
const USER_ID = '00000000-0000-0000-0000-0000000000f2'
const PRODUCTS = {
  starter: { month: 'pdt_starter_month', year: 'pdt_starter_year' },
  pro: { month: 'pdt_month', year: 'pdt_year' },
}
const ORIGIN = 'https://hushglance.app'

async function signed(body: string, { id = 'msg_1', at = NOW / 1000, secret = SECRET } = {}) {
  const timestamp = String(Math.floor(at))
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${await signWebhook(secret, id, timestamp, body)}`,
  })
}

const event = (type: string, data: Record<string, unknown> = {}) => ({
  business_id: 'bus_1',
  type,
  timestamp: '2026-10-12T09:59:58Z',
  data: {
    payload_type: 'Subscription',
    subscription_id: 'sub_1',
    status: 'active',
    product_id: 'pdt_month',
    customer: { customer_id: 'cus_1', email: 'pat@example.com' },
    metadata: { user_id: USER_ID },
    previous_billing_date: '2026-10-12T09:59:00Z',
    next_billing_date: '2026-11-12T09:59:00Z',
    ...data,
  },
})

describe('verifyWebhook', () => {
  it('accepts Dodo’s signature', async () => {
    const body = JSON.stringify(event('subscription.active'))
    expect(await verifyWebhook(await signed(body), body, SECRET, NOW)).toBe(true)
  })

  it('accepts any of several signatures (secret rotation)', async () => {
    const body = '{}'
    const headers = await signed(body)
    headers.set('webhook-signature', `v1,bm90LXRoaXMtb25l ${headers.get('webhook-signature')}`)
    expect(await verifyWebhook(headers, body, SECRET, NOW)).toBe(true)
  })

  it('rejects a tampered body, another secret, a missing header or an old delivery', async () => {
    const body = JSON.stringify(event('subscription.active'))
    const headers = await signed(body)
    expect(await verifyWebhook(headers, body.replace('active', 'expired'), SECRET, NOW)).toBe(false)
    const other = `whsec_${btoa('a-different-secret-entirely-32by')}`
    expect(await verifyWebhook(await signed(body, { secret: other }), body, SECRET, NOW)).toBe(
      false,
    )
    const missing = new Headers(headers)
    missing.delete('webhook-id')
    expect(await verifyWebhook(missing, body, SECRET, NOW)).toBe(false)
    const old = await signed(body, { at: NOW / 1000 - 6 * 60 })
    expect(await verifyWebhook(old, body, SECRET, NOW)).toBe(false)
  })

  it('compares in constant time', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('subscriptionChange', () => {
  it.each([
    ['subscription.active', 'active'],
    ['subscription.renewed', 'active'],
    ['subscription.plan_changed', 'active'],
    ['subscription.cancelled', 'cancelled'],
    ['subscription.past_due', 'past_due'],
    ['subscription.on_hold', 'on_hold'],
    ['subscription.failed', 'failed'],
    ['subscription.expired', 'expired'],
  ])('%s → %s', (type, status) => {
    expect(subscriptionChange(event(type), PRODUCTS)).toEqual({
      user_id: USER_ID,
      plan_id: 'pro',
      status,
      customer_id: 'cus_1',
      subscription_id: 'sub_1',
      period_start: '2026-10-12T09:59:00.000Z',
      period_end: '2026-11-12T09:59:00.000Z',
    })
  })

  it('takes the plan from the product: Starter, Pro, or unchanged when none is named', () => {
    const starter = event('subscription.active', { product_id: 'pdt_starter_year' })
    expect(subscriptionChange(starter, PRODUCTS)?.plan_id).toBe('starter')
    const upgraded = event('subscription.plan_changed', { product_id: 'pdt_month' })
    expect(subscriptionChange(upgraded, PRODUCTS)).toMatchObject({
      plan_id: 'pro',
      status: 'active',
    })
    const { product_id: _none, ...noProduct } = event('subscription.renewed').data
    expect(
      subscriptionChange({ ...event('subscription.renewed'), data: noProduct }, PRODUCTS)?.plan_id,
    ).toBeNull()
  })

  it('takes subscription.updated’s status from the payload', () => {
    expect(
      subscriptionChange(event('subscription.updated', { status: 'on_hold' }), PRODUCTS)?.status,
    ).toBe('on_hold')
    expect(
      subscriptionChange(event('subscription.updated', { status: 'pending' }), PRODUCTS),
    ).toBeNull()
  })

  it('ignores other events, other products and checkouts without a HushGlance user', () => {
    expect(subscriptionChange(event('payment.succeeded'), PRODUCTS)).toBeNull()
    expect(
      subscriptionChange(event('subscription.active', { product_id: 'pdt_other' }), PRODUCTS),
    ).toBeNull()
    expect(subscriptionChange(event('subscription.active', { metadata: {} }), PRODUCTS)).toBeNull()
    expect(
      subscriptionChange(
        event('subscription.active', { metadata: { user_id: 'drop table' } }),
        PRODUCTS,
      ),
    ).toBeNull()
  })
})

function setup({
  subscription = null as Record<string, unknown> | null,
  dodo = (url: string): Response =>
    url.endsWith('/checkouts')
      ? Response.json({
          session_id: 'cks_1',
          checkout_url: 'https://test.checkout.dodopayments.com/session/cks_1',
        })
      : Response.json({ link: 'https://customer.dodopayments.com/portal/abc' }),
} = {}) {
  const rpc = vi.fn(async () => 'applied')
  const rest: Rest = {
    user: vi.fn(async (token: string) =>
      token === 'user-jwt' ? { id: USER_ID, email: 'pat@example.com' } : null,
    ),
    rpc,
    selectOne: vi.fn(async () => subscription),
  }
  const fetch = vi.fn(async (url: string) => dodo(url))
  const deps: BillingDeps = {
    config: {
      dodoApiBase: 'https://test.dodopayments.com',
      dodoApiKey: 'dodo-SECRET',
      webhookSecret: SECRET,
      products: PRODUCTS,
      appOrigins: [ORIGIN],
    },
    rest,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => NOW,
    log: () => undefined,
  }
  return { deps, rpc, fetch }
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://x.supabase.co/functions/v1/billing/${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, authorization: 'Bearer user-jwt', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('handleBilling', () => {
  it('applies a verified webhook once, through billing_apply', async () => {
    const { deps, rpc } = setup()
    const body = JSON.stringify(event('subscription.active'))
    const headers = Object.fromEntries(await signed(body))
    const response = await handleBilling(post('webhook', body, headers), deps)
    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('billing_apply', {
      webhook: 'msg_1',
      event_type: 'subscription.active',
      event_time: '2026-10-12T09:59:58.000Z',
      change: expect.objectContaining({ user_id: USER_ID, status: 'active' }),
    })
  })

  it('asks Dodo to retry when the database fails, without crashing', async () => {
    const { deps, rpc } = setup()
    rpc.mockRejectedValueOnce(new Error('rpc billing_apply failed: 500'))
    const body = JSON.stringify(event('subscription.active'))
    const response = await handleBilling(
      post('webhook', body, Object.fromEntries(await signed(body))),
      deps,
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: { code: 'billing_failed' } })
  })

  it('refuses an unsigned webhook without touching the database', async () => {
    const { deps, rpc } = setup()
    const response = await handleBilling(
      post('webhook', JSON.stringify(event('subscription.active'))),
      deps,
    )
    expect(response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('starts a hosted checkout for the signed-in user, carrying their id', async () => {
    const { deps, fetch } = setup()
    const response = await handleBilling(post('checkout', { interval: 'year' }), deps)
    expect(await response.json()).toEqual({
      url: 'https://test.checkout.dodopayments.com/session/cks_1',
    })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://test.dodopayments.com/checkouts')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer dodo-SECRET')
    expect(JSON.parse(String(init.body))).toEqual({
      product_cart: [{ product_id: 'pdt_year', quantity: 1 }],
      customer: { email: 'pat@example.com' },
      return_url: `${ORIGIN}/app/account/billing?checkout=done`,
      metadata: { user_id: USER_ID },
    })
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('sells Starter with its own products', async () => {
    const { deps, fetch } = setup()
    await handleBilling(post('checkout', { plan: 'starter', interval: 'month' }), deps)
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).product_cart).toEqual([
      { product_id: 'pdt_starter_month', quantity: 1 },
    ])
  })

  it('reuses the Dodo customer, and refuses a plan they already have', async () => {
    const lapsed = setup({ subscription: { customer_id: 'cus_1', status: 'expired' } })
    await handleBilling(post('checkout', {}), lapsed.deps)
    const init = (lapsed.fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(String(init.body)).customer).toEqual({ customer_id: 'cus_1' })

    const pro = setup({
      subscription: {
        customer_id: 'cus_1',
        status: 'active',
        plan_id: 'pro',
        subscription_id: 'sub_1',
      },
    })
    const again = await handleBilling(post('checkout', { plan: 'pro' }), pro.deps)
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ error: { code: 'already_on_plan' } })
    expect(pro.fetch).not.toHaveBeenCalled()
  })

  it('moves Starter to Pro with Dodo’s plan change, prorated, without a second subscription', async () => {
    const { deps, fetch } = setup({
      subscription: {
        customer_id: 'cus_1',
        status: 'active',
        plan_id: 'starter',
        subscription_id: 'sub_9',
      },
      dodo: () => Response.json({ payment_id: 'pay_1', payment_link: null }),
    })
    const response = await handleBilling(post('checkout', { plan: 'pro', interval: 'month' }), deps)
    expect(await response.json()).toEqual({ changed: true })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://test.dodopayments.com/subscriptions/sub_9/change-plan')
    expect(JSON.parse(String(init.body))).toEqual({
      product_id: 'pdt_month',
      quantity: 1,
      proration_billing_mode: 'prorated_immediately',
    })

    // When Dodo needs the payment confirmed, the customer goes to its page.
    const confirm = setup({
      subscription: { status: 'active', plan_id: 'starter', subscription_id: 'sub_9' },
      dodo: () => Response.json({ payment_link: 'https://test.checkout.dodopayments.com/pay/1' }),
    })
    const linked = await handleBilling(post('checkout', { plan: 'pro' }), confirm.deps)
    expect(await linked.json()).toEqual({ url: 'https://test.checkout.dodopayments.com/pay/1' })
  })

  it('opens the customer portal for a customer, and says so when there is none', async () => {
    const { deps, fetch } = setup({ subscription: { customer_id: 'cus_1' } })
    const response = await handleBilling(post('portal', {}), deps)
    expect(await response.json()).toEqual({ url: 'https://customer.dodopayments.com/portal/abc' })
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      `https://test.dodopayments.com/customers/cus_1/customer-portal/session?return_url=${encodeURIComponent(`${ORIGIN}/app/account/billing`)}`,
    )
    const none = setup()
    expect((await handleBilling(post('portal', {}), none.deps)).status).toBe(404)
  })

  it('needs a signed-in user and an allowed origin for checkout', async () => {
    const { deps, fetch } = setup()
    expect(
      (await handleBilling(post('checkout', {}, { authorization: 'Bearer nope' }), deps)).status,
    ).toBe(401)
    expect(
      (await handleBilling(post('checkout', {}, { origin: 'https://evil.example' }), deps)).status,
    ).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('function settings', () => {
  it('read the secrets, and refuse to start without them', () => {
    const env: Record<string, string> = {
      OPENROUTER_API_KEY: 'sk-or-1',
      APP_ORIGINS: 'https://hushglance.app/, http://localhost:5173, not a url',
      AI_DAILY_BUDGET_USD: '25',
    }
    expect(readAiConfig((name) => env[name])).toEqual({
      openRouterKey: 'sk-or-1',
      upstreamUrl: 'https://openrouter.ai/api/v1/chat/completions',
      appOrigins: ['https://hushglance.app', 'http://localhost:5173'],
      dailyBudgetUsd: 25,
    })
    expect(() => readAiConfig(() => undefined)).toThrow(/OPENROUTER_API_KEY/)
    // 0 is the kill switch (pause now), not "no limit"; unset or nonsense means no limit.
    const budgetOf = (value: string | undefined) =>
      readAiConfig((name) => ({ ...env, AI_DAILY_BUDGET_USD: value })[name]).dailyBudgetUsd
    expect(budgetOf('0')).toBe(0)
    expect(budgetOf(undefined)).toBeNull()
    expect(budgetOf('lots')).toBeNull()
    expect(() =>
      readBillingConfig((name) => ({ DODO_API_BASE: 'https://evil.example' })[name]),
    ).toThrow()
  })

  it('prefer the new secret key, else the legacy service_role key', () => {
    expect(
      serviceKeyFrom((name) => ({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_1"}' })[name]),
    ).toBe('sb_secret_1')
    expect(serviceKeyFrom((name) => ({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy' })[name])).toBe(
      'eyJ.legacy',
    )
    expect(originsFrom(undefined)).toEqual([])
  })
})

describe('supabaseRest', () => {
  it('calls RPCs as the service role, and takes a void function’s empty answer', async () => {
    const seen: { url: string; headers: Headers }[] = []
    const fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, headers: new Headers(init.headers) })
      return new Response(null, { status: 204 })
    }) as unknown as typeof globalThis.fetch
    const rest = supabaseRest({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', fetch })
    expect(await rest.rpc('ai_finish', { usage: 1 })).toBeNull()
    expect(seen[0]?.url).toBe('https://x.supabase.co/rest/v1/rpc/ai_finish')
    expect(seen[0]?.headers.get('apikey')).toBe('sb_secret_abc')
    // A new secret key isn't a JWT: it never goes in Authorization.
    expect(seen[0]?.headers.get('authorization')).toBeNull()

    const legacy = supabaseRest({ url: 'https://x.supabase.co', serviceKey: 'eyJ.legacy', fetch })
    await legacy.rpc('ai_finish', {})
    expect(seen[1]?.headers.get('authorization')).toBe('Bearer eyJ.legacy')
  })

  it('reads the signed-in user from Auth, or null for a bad token', async () => {
    const fetch = (async (_url: string, init: RequestInit) =>
      new Headers(init.headers).get('authorization') === 'Bearer good'
        ? Response.json({ id: 'u1', email: 'a@example.com' })
        : new Response('{}', { status: 401 })) as unknown as typeof globalThis.fetch
    const rest = supabaseRest({ url: 'https://x.supabase.co', serviceKey: 'sb_secret_abc', fetch })
    expect(await rest.user('good')).toEqual({ id: 'u1', email: 'a@example.com' })
    expect(await rest.user('bad')).toBeNull()
  })
})
