import { createProvider, type LLMProvider } from '@/ai/providers'
import type { Effort } from '@/ai/schemas'
import { accountsConfig } from '@/platform/config'
import { accountClient as client } from '@/platform/supabase'

// HushGlance AI (F-PLAN-01, PRD D119): the OpenRouter provider pointed at our `ai` Edge Function,
// which adds the server's key and forces zero data retention. Only what the privacy mode allows is
// in the request (src/ai/context.ts builds it, as for any provider); this module adds who is asking
// (the session) and which question the call belongs to (the meter), nothing else.

/** The question a call is charged to: one per ask (with its repairs and summary), dashboard or suggestion. */
export interface Meter {
  id: string
  kind: 'ask' | 'dashboard' | 'suggest'
}

/** No session: answered here, as the proxy would (and not retried). */
const signedOut = () =>
  new Response(
    JSON.stringify({
      error: { code: 'not_signed_in', message: 'Sign in again to use HushGlance AI.' },
    }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

export interface HostedCallbacks {
  /** What's left of the user's questions, after every call. */
  onRemaining: (remaining: number) => void
  /** The proxy refused for the plan's sake (quota_reached, model_not_in_plan). */
  onRefusal: (code: string) => void
}

/**
 * The fetch the OpenAI client uses for hosted calls: the current session's token (fresh on every
 * call), the project's publishable key and the meter. Every other header the SDK adds is dropped,
 * and nothing goes anywhere but our own function.
 */
export function hostedFetch(
  base: string,
  meter: Meter,
  { onRemaining, onRefusal }: HostedCallbacks,
): typeof fetch {
  return async (input, init) => {
    const config = accountsConfig()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!config || !url.startsWith(`${base}/`)) {
      throw new Error('HushGlance AI only calls its own service.')
    }
    const { data } = await client().auth.getSession()
    const token = data.session?.access_token
    if (!token) return signedOut()
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: config.key,
        'content-type': 'application/json',
        'x-fq-question': meter.id,
        'x-fq-kind': meter.kind,
      },
      body: init?.body,
      signal: init?.signal,
    })
    const remaining = Number(response.headers.get('x-fq-remaining') ?? 'NaN')
    if (Number.isFinite(remaining)) onRemaining(remaining)
    if (response.status === 402 || response.status === 403) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => null)
      const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null
      if (typeof error === 'object' && error !== null && 'code' in error) {
        onRefusal(String(error.code))
      }
    }
    return response
  }
}

/** The hosted provider for one question (its meter goes on every call it makes). */
export function createHostedProvider({
  model,
  summaryModel,
  effort,
  meter,
  ...callbacks
}: {
  model: string
  summaryModel: string
  effort: Effort
  meter: Meter
} & HostedCallbacks): Promise<LLMProvider> {
  const config = accountsConfig()
  if (!config) throw new Error('Accounts are off.')
  const base = `${config.url}/functions/v1/ai/v1`
  return createProvider({
    provider: 'openrouter',
    // The proxy uses HushGlance's key; the client's placeholder is replaced by the session token.
    apiKey: 'hushglance-hosted',
    model,
    summaryModel,
    effort,
    baseUrl: base,
    hosted: true,
    fetch: hostedFetch(base, meter, callbacks),
  })
}
