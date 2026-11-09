import { createProvider, type LLMProvider } from '@/ai/providers'
import type { Effort } from '@/ai/schemas'

// HushGlance AI's requests (F-PLAN-01, PRD D119): the OpenRouter provider pointed at our `ai` Edge
// Function, which adds the server's key and forces zero data retention. Only what the privacy mode
// allows is in the request (src/ai/context.ts builds it, as for any provider); this module adds who
// is asking and which question the call belongs to (the meter), nothing else. Shared by a signed-in
// user's calls (hostedAi.ts adds the session) and a guest's (guestAi.ts, D125: no session at all).
// No supabase-js here, so a guest never downloads it.

/** The question a call is charged to: one per ask (with its repairs and summary), dashboard or suggestion. */
export interface Meter {
  id: string
  kind: 'ask' | 'dashboard' | 'suggest'
}

export interface HostedCallbacks {
  /** What's left of the user's questions, after every call. */
  onRemaining: (remaining: number) => void
  /** The proxy refused for the plan's sake (quota_reached, model_not_in_plan). */
  onRefusal: (code: string) => void
}

/** Who a call is from: the headers that say so, or a response to answer with instead (signed out). */
export type Credentials = () => Promise<Record<string, string> | Response>

/** The `ai` function's OpenAI-compatible base: `<project>/functions/v1/ai/v1`. */
export const aiBase = (serviceUrl: string) => `${serviceUrl}/functions/v1/ai/v1`

/**
 * The fetch the OpenAI client uses for hosted calls: the caller's credentials (fresh on every call)
 * and the meter. Every other header the SDK adds is dropped, and nothing goes anywhere but our own
 * function.
 */
export function meteredFetch(
  base: string,
  meter: Meter,
  { onRemaining, onRefusal }: HostedCallbacks,
  credentials: Credentials,
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(`${base}/`)) throw new Error('HushGlance AI only calls its own service.')
    const caller = await credentials()
    if (caller instanceof Response) return caller
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...caller,
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

/** The hosted provider for one question, its calls going through `fetch`. */
export function createMeteredProvider({
  model,
  summaryModel,
  effort,
  base,
  fetch,
}: {
  model: string
  summaryModel: string
  effort: Effort
  base: string
  fetch: typeof globalThis.fetch
}): Promise<LLMProvider> {
  return createProvider({
    provider: 'openrouter',
    // The proxy uses HushGlance's key; the client's placeholder never leaves (meteredFetch).
    apiKey: 'hushglance-hosted',
    model,
    summaryModel,
    effort,
    baseUrl: base,
    hosted: true,
    fetch,
  })
}
