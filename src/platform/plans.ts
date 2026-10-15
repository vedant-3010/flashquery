import {
  CatalogSchema,
  QuotaSchema,
  type BillingInterval,
  type Catalog,
  type PaidPlanId,
  type Quota,
} from '@/lib/plans'
import { AppError } from '@/lib/errors'
import { z } from '@/lib/zod'
import { accountsConfig } from '@/platform/config'
import { accountError } from '@/platform/errors'
import { accountClient as client } from '@/platform/supabase'

// Plans and billing (F-PLAN-01…04): the hosted model list, what's left of the signed-in user's
// questions, and Dodo's hosted checkout and customer portal through the billing Edge Function.
// Lazy, like everything in src/platform/: reached only through src/stores/plan.ts.

/** The listed hosted models and the plans (public tables; their policies show only listed models). */
export async function loadCatalog(): Promise<Catalog> {
  const [models, plans] = await Promise.all([
    client().from('ai_models').select('id, label, maker, description, tier, weight').order('sort'),
    client()
      .from('plans')
      .select('id, label, questions, period, tiers, price_monthly_usd, price_yearly_usd'),
  ])
  if (models.error) throw accountError(models.error)
  if (plans.error) throw accountError(plans.error)
  return CatalogSchema.parse({ models: models.data, plans: plans.data })
}

/** The signed-in user's plan and what's left of it. */
export async function loadQuota(): Promise<Quota> {
  const { data, error } = await client().rpc('ai_quota')
  if (error) throw accountError(error)
  return QuotaSchema.parse(data)
}

const UrlResultSchema = z.object({ url: z.string().url() })
/** A plan change Dodo made at once (Starter → Pro): the webhook brings the new plan. */
const ChangedResultSchema = z.object({ changed: z.literal(true) })
const ErrorResultSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

/**
 * POSTs to the billing function as the signed-in user: the page to send them to, or `changed`
 * when their subscription moved to another plan without leaving the app.
 */
async function billing(
  path: 'checkout' | 'portal',
  body: object,
): Promise<{ url: string } | { changed: true }> {
  const config = accountsConfig()
  const { data } = await client().auth.getSession()
  const token = data.session?.access_token
  if (!config || !token) {
    throw new AppError({ code: 'not_signed_in', message: 'Sign in first.', detail: null })
  }
  let response: Response
  try {
    response = await fetch(`${config.url}/functions/v1/billing/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: config.key,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new AppError({
      code: 'billing_offline',
      message: "Couldn't reach billing. Check your connection and try again.",
      detail: String(error),
    })
  }
  const result: unknown = await response.json().catch(() => null)
  const ok = UrlResultSchema.or(ChangedResultSchema).safeParse(result)
  if (response.ok && ok.success) return ok.data
  const failed = ErrorResultSchema.safeParse(result)
  throw new AppError({
    code: failed.success ? failed.data.error.code : 'billing_failed',
    message: failed.success ? failed.data.error.message : 'Billing is having trouble. Try again.',
    detail: `HTTP ${response.status}`,
  })
}

/**
 * Starter or Pro (monthly or yearly): Dodo's hosted checkout, or, for someone already subscribed,
 * a prorated plan change (Starter → Pro).
 */
export function startCheckout(
  plan: PaidPlanId,
  interval: BillingInterval,
): Promise<{ url: string } | { changed: true }> {
  return billing('checkout', { plan, interval })
}

/** Dodo's customer portal: payment method, invoices, cancelling. */
export async function billingPortal(): Promise<string> {
  const result = await billing('portal', {})
  if ('url' in result) return result.url
  throw new AppError({ code: 'portal_failed', message: 'Couldn’t open billing.', detail: null })
}
