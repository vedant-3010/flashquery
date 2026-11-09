import type { LLMProvider } from '@/ai/providers'
import type { Effort } from '@/ai/schemas'
import { accountsConfig } from '@/platform/config'
import {
  aiBase,
  createMeteredProvider,
  meteredFetch,
  type HostedCallbacks,
  type Meter,
} from '@/platform/meteredFetch'
import { accountClient as client } from '@/platform/supabase'

// HushGlance AI for a signed-in user (F-PLAN-01, PRD D119): the metered calls (meteredFetch.ts)
// carry the session, so the `ai` function charges their plan.

export type { HostedCallbacks, Meter }

/** No session: answered here, as the proxy would (and not retried). */
const signedOut = () =>
  new Response(
    JSON.stringify({
      error: { code: 'not_signed_in', message: 'Sign in again to use HushGlance AI.' },
    }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

/** The fetch for a signed-in user's calls: the current session's token and the publishable key. */
export function hostedFetch(base: string, meter: Meter, callbacks: HostedCallbacks): typeof fetch {
  return meteredFetch(base, meter, callbacks, async () => {
    const config = accountsConfig()
    if (!config) throw new Error('HushGlance AI only calls its own service.')
    const { data } = await client().auth.getSession()
    const token = data.session?.access_token
    if (!token) return signedOut()
    return { authorization: `Bearer ${token}`, apikey: config.key }
  })
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
  const base = aiBase(config.url)
  return createMeteredProvider({
    model,
    summaryModel,
    effort,
    base,
    fetch: hostedFetch(base, meter, callbacks),
  })
}
