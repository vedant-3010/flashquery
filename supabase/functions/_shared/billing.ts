import { bearer, corsHeaders, errorResponse, isRecord, jsonResponse, readBody } from './http.ts'
import type { Rest } from './rest.ts'

// Starter and Pro through Dodo Payments (F-PLAN-03/04, PRD D120), a merchant of record: Dodo hosts
// the checkout and the customer portal, so no payment script ever runs on our pages. Subscriptions
// change only through the webhook, verified with the Standard Webhooks signature and applied once
// per delivery (billing_apply). We never see card details.

export const BILLING_ALLOW_HEADERS = 'authorization, apikey, content-type'

export type PaidPlan = 'starter' | 'pro'
export type Interval = 'month' | 'year'
const PLAN_LABELS: Record<PaidPlan, string> = { starter: 'Starter', pro: 'Pro' }
const TOLERANCE_SECONDS = 5 * 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface BillingConfig {
  /** https://test.dodopayments.com (test mode) or https://live.dodopayments.com */
  dodoApiBase: string
  dodoApiKey: string
  /** whsec_… from Dodo's webhook settings. */
  webhookSecret: string
  /** Dodo product ids for each paid plan, billed monthly and yearly. */
  products: Record<PaidPlan, Record<Interval, string>>
  appOrigins: string[]
}

export interface BillingDeps {
  config: BillingConfig
  rest: Rest
  fetch: typeof globalThis.fetch
  now: () => number
  log: (line: string) => void
}

// ---- Standard Webhooks signatures ----------------------------------------------------------

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

/** Compares in time that doesn't depend on where the strings differ. */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export async function signWebhook(secret: string, id: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  )
  return bytesToBase64(mac)
}

/**
 * True when the delivery is Dodo's: an HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}`
 * matching one of the `v1,<base64>` signatures, sent within five minutes (no replays later).
 */
export async function verifyWebhook(
  headers: Headers,
  body: string,
  secret: string,
  nowMs: number,
): Promise<boolean> {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatures = headers.get('webhook-signature')
  if (!id || !timestamp || !signatures || !secret) return false
  const sent = Number(timestamp)
  if (!Number.isInteger(sent) || Math.abs(nowMs / 1000 - sent) > TOLERANCE_SECONDS) return false
  let expected: string
  try {
    expected = await signWebhook(secret, id, timestamp, body)
  } catch {
    return false
  }
  return signatures.split(' ').some((entry) => {
    const [version, value] = entry.split(',')
    return version === 'v1' && value !== undefined && timingSafeEqual(value, expected)
  })
}

// ---- Events → subscription changes ---------------------------------------------------------

export interface SubscriptionChange {
  user_id: string
  /** From the event's product; null when the event names none (the plan stays as it was). */
  plan_id: PaidPlan | null
  status: 'active' | 'cancelled' | 'past_due' | 'on_hold' | 'failed' | 'expired'
  customer_id: string | null
  subscription_id: string | null
  period_start: string | null
  period_end: string | null
}

const STATUSES = new Set(['active', 'cancelled', 'past_due', 'on_hold', 'failed', 'expired'])

function statusFor(type: string, dataStatus: unknown): SubscriptionChange['status'] | null {
  switch (type) {
    case 'subscription.active':
    case 'subscription.renewed':
    case 'subscription.plan_changed':
      return 'active'
    case 'subscription.updated':
      return typeof dataStatus === 'string' && STATUSES.has(dataStatus)
        ? (dataStatus as SubscriptionChange['status'])
        : null
    case 'subscription.cancelled':
      return 'cancelled'
    case 'subscription.past_due':
      return 'past_due'
    case 'subscription.on_hold':
      return 'on_hold'
    case 'subscription.failed':
      return 'failed'
    case 'subscription.expired':
      return 'expired'
    default:
      return null
  }
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)
const date = (value: unknown) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : null

/** Which plan a Dodo product sells, or null for a product that isn't ours. */
export function planOfProduct(
  products: BillingConfig['products'],
  productId: string,
): PaidPlan | null {
  for (const plan of Object.keys(products) as PaidPlan[]) {
    if (Object.values(products[plan]).includes(productId)) return plan
  }
  return null
}

/**
 * What a Dodo event changes, or null when it isn't about a subscription we started (other events,
 * other products, or no HushGlance user in the checkout's metadata). A plan change names the new
 * product, so Starter → Pro moves the plan.
 */
export function subscriptionChange(
  event: unknown,
  products: BillingConfig['products'],
): SubscriptionChange | null {
  if (!isRecord(event) || typeof event.type !== 'string' || !isRecord(event.data)) return null
  const { data } = event
  const status = statusFor(event.type, data.status)
  const userId = isRecord(data.metadata) ? data.metadata.user_id : null
  if (!status || typeof userId !== 'string' || !UUID.test(userId)) return null
  const plan =
    data.product_id === undefined ? null : planOfProduct(products, String(data.product_id))
  if (data.product_id !== undefined && plan === null) return null
  return {
    user_id: userId,
    plan_id: plan,
    status,
    customer_id: isRecord(data.customer) ? text(data.customer.customer_id) : null,
    subscription_id: text(data.subscription_id),
    period_start: date(data.previous_billing_date),
    period_end: date(data.next_billing_date),
  }
}

// ---- The function --------------------------------------------------------------------------

async function webhook(request: Request, deps: BillingDeps): Promise<Response> {
  const body = await readBody(request, 1024 * 1024)
  if (body === null) return errorResponse(413, 'too_large', 'Too large.')
  if (!(await verifyWebhook(request.headers, body, deps.config.webhookSecret, deps.now()))) {
    deps.log('billing webhook: bad signature')
    return errorResponse(401, 'bad_signature', 'Signature check failed.')
  }
  let event: unknown
  try {
    event = JSON.parse(body)
  } catch {
    return errorResponse(400, 'bad_request', 'Expected JSON.')
  }
  const type = isRecord(event) && typeof event.type === 'string' ? event.type : 'unknown'
  const sentAt =
    (isRecord(event) && date(event.timestamp)) ||
    new Date(Number(request.headers.get('webhook-timestamp')) * 1000).toISOString()
  let outcome: unknown
  try {
    outcome = await deps.rest.rpc('billing_apply', {
      webhook: request.headers.get('webhook-id'),
      event_type: type,
      event_time: sentAt,
      change: subscriptionChange(event, deps.config.products),
    })
  } catch {
    // Dodo retries a failed delivery (up to 8 times over a day): nothing is lost.
    deps.log(`billing webhook ${type}: not applied`)
    return errorResponse(500, 'billing_failed', 'Not applied; retry later.')
  }
  deps.log(`billing webhook ${type}: ${String(outcome)}`)
  return jsonResponse(200, { outcome })
}

/** Moves an active subscription to another product (Starter ↔ Pro), prorated now. */
async function changePlan(
  deps: BillingDeps,
  cors: Record<string, string>,
  subscriptionId: string,
  productId: string,
) {
  const response = await deps.fetch(
    `${deps.config.dodoApiBase}/subscriptions/${encodeURIComponent(subscriptionId)}/change-plan`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${deps.config.dodoApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        product_id: productId,
        quantity: 1,
        proration_billing_mode: 'prorated_immediately',
      }),
    },
  )
  if (!response.ok) {
    deps.log(`billing change-plan failed: ${response.status}`)
    return errorResponse(
      502,
      'change_failed',
      'Couldn’t change your plan. Try again, or use Manage subscription.',
      cors,
    )
  }
  // Usually done at once (the webhook brings the new plan); a payment Dodo needs confirmed comes
  // back as a link to send the customer to.
  const result: unknown = await response.json().catch(() => null)
  const link = isRecord(result) ? text(result.payment_link) : null
  return jsonResponse(200, link?.startsWith('https://') ? { url: link } : { changed: true }, cors)
}

async function checkout(
  request: Request,
  deps: BillingDeps,
  cors: Record<string, string>,
  origin: string,
) {
  const token = bearer(request)
  const user = token ? await deps.rest.user(token) : null
  if (!user) return errorResponse(401, 'not_signed_in', 'Sign in to upgrade.', cors)
  const input: unknown = JSON.parse((await readBody(request, 4096)) ?? '{}')
  const plan: PaidPlan = isRecord(input) && input.plan === 'starter' ? 'starter' : 'pro'
  const interval: Interval = isRecord(input) && input.interval === 'year' ? 'year' : 'month'
  const productId = deps.config.products[plan][interval]
  const current = await deps.rest.selectOne(
    'subscriptions',
    `user_id=eq.${user.id}`,
    'customer_id,status,plan_id,subscription_id',
  )
  const subscriptionId = text(current?.subscription_id)
  if (current?.status === 'active') {
    if (current.plan_id === plan) {
      return errorResponse(409, 'already_on_plan', `You’re already on ${PLAN_LABELS[plan]}.`, cors)
    }
    if (subscriptionId) return changePlan(deps, cors, subscriptionId, productId)
  }
  const customerId = text(current?.customer_id)
  const response = await deps.fetch(`${deps.config.dodoApiBase}/checkouts`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${deps.config.dodoApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: customerId ? { customer_id: customerId } : { email: user.email },
      return_url: `${origin}/app/account/billing?checkout=done`,
      metadata: { user_id: user.id },
    }),
  })
  const result: unknown = response.ok ? await response.json() : null
  const url = isRecord(result) ? text(result.checkout_url) : null
  if (!url?.startsWith('https://')) {
    deps.log(`billing checkout failed: ${response.status}`)
    return errorResponse(502, 'checkout_failed', 'Couldn’t start the checkout. Try again.', cors)
  }
  return jsonResponse(200, { url }, cors)
}

async function portal(
  request: Request,
  deps: BillingDeps,
  cors: Record<string, string>,
  origin: string,
) {
  const token = bearer(request)
  const user = token ? await deps.rest.user(token) : null
  if (!user) return errorResponse(401, 'not_signed_in', 'Sign in first.', cors)
  const current = await deps.rest.selectOne('subscriptions', `user_id=eq.${user.id}`, 'customer_id')
  const customerId = text(current?.customer_id)
  if (!customerId) {
    return errorResponse(404, 'no_subscription', 'There’s no subscription to manage yet.', cors)
  }
  const back = encodeURIComponent(`${origin}/app/account/billing`)
  const response = await deps.fetch(
    `${deps.config.dodoApiBase}/customers/${encodeURIComponent(customerId)}/customer-portal/session?return_url=${back}`,
    { method: 'POST', headers: { authorization: `Bearer ${deps.config.dodoApiKey}` } },
  )
  const result: unknown = response.ok ? await response.json() : null
  const url = isRecord(result) ? text(result.link) : null
  if (!url?.startsWith('https://')) {
    deps.log(`billing portal failed: ${response.status}`)
    return errorResponse(502, 'portal_failed', 'Couldn’t open billing. Try again.', cors)
  }
  return jsonResponse(200, { url }, cors)
}

export async function handleBilling(request: Request, deps: BillingDeps): Promise<Response> {
  const path = new URL(request.url).pathname
  if (path.endsWith('/webhook')) {
    return request.method === 'POST'
      ? webhook(request, deps)
      : errorResponse(405, 'method_not_allowed', 'POST only.')
  }
  const origin = request.headers.get('origin') ?? ''
  const cors = corsHeaders(origin, deps.config.appOrigins, BILLING_ALLOW_HEADERS)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} })
  }
  if (!cors) return errorResponse(403, 'origin_not_allowed', 'Not allowed from this origin.')
  if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'POST only.', cors)
  try {
    if (path.endsWith('/checkout')) return await checkout(request, deps, cors, origin)
    if (path.endsWith('/portal')) return await portal(request, deps, cors, origin)
  } catch {
    deps.log(`billing ${path} failed`)
    return errorResponse(502, 'billing_failed', 'Billing is having trouble. Try again.', cors)
  }
  return errorResponse(404, 'not_found', 'Not found.', cors)
}
