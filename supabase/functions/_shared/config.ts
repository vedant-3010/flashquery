import type { AiConfig } from './aiProxy.ts'
import type { BillingConfig } from './billing.ts'
import { originsFrom } from './rest.ts'

// The functions' settings, from their secrets (docs/DEPLOY.md). Pure: index.ts passes Deno.env.get.

type Get = (name: string) => string | undefined

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function required(get: Get, name: string): string {
  const value = get(name)?.trim()
  if (!value) throw new Error(`Missing the ${name} secret`)
  return value
}

export function readAiConfig(get: Get): AiConfig {
  // Unset means no daily limit; 0 pauses hosted AI at once (the kill switch, docs/RELEASE.md).
  const rawBudget = get('AI_DAILY_BUDGET_USD')?.trim()
  const budget = rawBudget ? Number(rawBudget) : Number.NaN
  return {
    openRouterKey: required(get, 'OPENROUTER_API_KEY'),
    // Only for local runs against a stub (supabase functions serve): never set in production.
    upstreamUrl: get('OPENROUTER_UPSTREAM')?.trim() || OPENROUTER_URL,
    appOrigins: originsFrom(required(get, 'APP_ORIGINS')),
    dailyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : null,
  }
}

export function readBillingConfig(get: Get): BillingConfig {
  const base = required(get, 'DODO_API_BASE').replace(/\/$/, '')
  if (!/^https:\/\/(test|live)\.dodopayments\.com$/.test(base) && !base.startsWith('http://')) {
    throw new Error(
      'DODO_API_BASE must be https://test.dodopayments.com or https://live.dodopayments.com',
    )
  }
  return {
    dodoApiBase: base,
    dodoApiKey: required(get, 'DODO_API_KEY'),
    webhookSecret: required(get, 'DODO_WEBHOOK_SECRET'),
    products: {
      starter: {
        month: required(get, 'DODO_PRODUCT_STARTER_MONTHLY'),
        year: required(get, 'DODO_PRODUCT_STARTER_YEARLY'),
      },
      pro: {
        month: required(get, 'DODO_PRODUCT_PRO_MONTHLY'),
        year: required(get, 'DODO_PRODUCT_PRO_YEARLY'),
      },
    },
    appOrigins: originsFrom(required(get, 'APP_ORIGINS')),
  }
}
