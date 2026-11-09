import type { LLMProvider } from '@/ai/providers'
import type { Effort } from '@/ai/schemas'
import { AppError } from '@/lib/errors'
import { CatalogSchema, QuotaSchema, type Catalog, type Quota } from '@/lib/plans'
import { accountsConfig, type AccountsConfig } from '@/platform/config'
import {
  aiBase,
  createMeteredProvider,
  meteredFetch,
  type HostedCallbacks,
  type Meter,
} from '@/platform/meteredFetch'

// HushGlance AI for guests (PRD D125, F-PLAN-06): no account and no session, so no supabase-js
// either: plain requests with the project's publishable key, to the public model list and the `ai`
// function, which counts a guest by a keyed hash of their IP address. Reached only through
// src/stores/plan.ts (lint), once a guest turned it on: until then a guest's browser never
// contacts the account service (F-SEC-09).

function service(): AccountsConfig {
  const config = accountsConfig()
  if (!config) {
    throw new AppError({
      code: 'hosted_unavailable',
      message: 'HushGlance AI isn’t set up here.',
      detail: null,
    })
  }
  return config
}

async function getJson(url: string, key: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { headers: { apikey: key } })
  } catch (error) {
    throw new AppError({
      code: 'hosted_offline',
      message: 'Couldn’t reach HushGlance AI. Check your connection and try again.',
      detail: String(error),
    })
  }
  if (!response.ok) {
    throw new AppError({
      code: response.status === 403 ? 'guests_off' : 'hosted_unavailable',
      message: 'HushGlance AI without an account isn’t available here.',
      detail: `HTTP ${response.status}`,
    })
  }
  return response.json()
}

/** The listed hosted models and the plans (public tables, as for anyone). */
export async function loadGuestCatalog(): Promise<Catalog> {
  const { url, key } = service()
  const [models, plans] = await Promise.all([
    getJson(
      `${url}/rest/v1/ai_models?select=id,label,maker,description,tier,weight&order=sort`,
      key,
    ),
    getJson(
      `${url}/rest/v1/plans?select=id,label,questions,period,tiers,price_monthly_usd,price_yearly_usd,storage_bytes`,
      key,
    ),
  ])
  return CatalogSchema.parse({ models, plans })
}

/** What's left of this guest's day (the `ai` function's `GET …/v1/guest`). */
export async function loadGuestQuota(): Promise<Quota> {
  const { url, key } = service()
  return QuotaSchema.parse(await getJson(`${aiBase(url)}/guest`, key))
}

/** The fetch for a guest's calls: the publishable key and the meter, no session. */
export function guestFetch(base: string, meter: Meter, callbacks: HostedCallbacks): typeof fetch {
  return meteredFetch(base, meter, callbacks, async () => ({ apikey: service().key }))
}

/** The hosted provider for one of a guest's questions. */
export function createGuestProvider({
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
  const base = aiBase(service().url)
  return createMeteredProvider({
    model,
    summaryModel,
    effort,
    base,
    fetch: guestFetch(base, meter, callbacks),
  })
}
