import { z } from '@/lib/zod'

// HushGlance AI's plans (F-PLAN-01…04, PRD D119–D121): the hosted model list and the plans, as the
// ai_models and plans tables give them, and what's left of a signed-in user's questions (ai_quota).
// Pure: the calls are in src/platform/plans.ts; the state in src/stores/plan.ts.

export const TierSchema = z.enum(['standard', 'premium', 'fast'])
export type Tier = z.infer<typeof TierSchema>

export const HostedModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  maker: z.string(),
  description: z.string(),
  tier: TierSchema,
  /** Questions an ask with it uses (premium: 5). */
  weight: z.number(),
})
export type HostedModel = z.infer<typeof HostedModelSchema>

export const PlanIdSchema = z.enum(['free', 'starter', 'pro'])
export type PlanId = z.infer<typeof PlanIdSchema>

export const PlanSchema = z.object({
  id: PlanIdSchema,
  label: z.string(),
  questions: z.number(),
  period: z.enum(['lifetime', 'month']),
  tiers: z.array(TierSchema),
  price_monthly_usd: z.coerce.number().nullable(),
  price_yearly_usd: z.coerce.number().nullable(),
})
export type Plan = z.infer<typeof PlanSchema>

export const CatalogSchema = z.object({
  models: z.array(HostedModelSchema),
  plans: z.array(PlanSchema),
})
export type Catalog = z.infer<typeof CatalogSchema>

export const QuotaSchema = z.object({
  plan: PlanIdSchema,
  label: z.string(),
  questions: z.number(),
  period: z.enum(['lifetime', 'month']),
  used: z.number(),
  remaining: z.number(),
  tiers: z.array(TierSchema),
  renews_at: z.string().nullable(),
  status: z.string().nullable(),
  has_customer: z.boolean(),
})
export type Quota = z.infer<typeof QuotaSchema>

/** The models someone can ask with (not the fast ones, which only write summaries). */
export function plannerModels(catalog: Catalog): HostedModel[] {
  return catalog.models.filter((model) => model.tier !== 'fast')
}

/** Whether a plan may plan with a model (free: standard only). */
export function allowedOn(model: HostedModel, tiers: readonly Tier[]): boolean {
  return model.tier !== 'fast' && tiers.includes(model.tier)
}

/**
 * The model a hosted question uses: the chosen one when the plan allows it, else the plan's first
 * listed one. Null when nothing is listed (hosted AI isn't offered on this deployment).
 */
export function pickHostedModel(
  catalog: Catalog,
  chosen: string,
  tiers: readonly Tier[],
): HostedModel | null {
  const usable = plannerModels(catalog).filter((model) => allowedOn(model, tiers))
  return usable.find((model) => model.id === chosen) ?? usable[0] ?? null
}

/** The fast model that writes a planner's summaries: the same maker's, else the first one listed. */
export function summaryModelFor(catalog: Catalog, planner: HostedModel): string {
  const fast = catalog.models.filter((model) => model.tier === 'fast')
  return (fast.find((model) => model.maker === planner.maker) ?? fast[0] ?? planner).id
}

/** "2 free questions left", "40 left this month": the ask bar's meter. */
export function remainingLabel(quota: Pick<Quota, 'remaining' | 'period' | 'plan'>): string {
  const count = quota.remaining
  const noun = count === 1 ? 'question' : 'questions'
  if (quota.plan === 'free')
    return count === 0 ? 'No free questions left' : `${count} free ${noun} left`
  return `${count} ${noun} left this month`
}

/** Whether the meter shows: always on free, on Pro only when under a fifth is left. */
export function meterVisible(quota: Pick<Quota, 'remaining' | 'questions' | 'plan'>): boolean {
  return quota.plan === 'free' || quota.remaining < quota.questions / 5
}

export type PaidPlanId = Exclude<PlanId, 'free'>
export type BillingInterval = 'month' | 'year'

/**
 * The plans someone on `current` can move up to, cheapest first: Starter and Pro from free, Pro
 * from Starter, none from Pro.
 */
export function upgradesFrom(catalog: Catalog, current: PlanId): (Plan & { id: PaidPlanId })[] {
  const rank = (plan: Pick<Plan, 'price_monthly_usd'>) => plan.price_monthly_usd ?? 0
  const now = catalog.plans.find((plan) => plan.id === current)
  return catalog.plans
    .filter((plan): plan is Plan & { id: PaidPlanId } => plan.id !== 'free')
    .filter((plan) => rank(plan) > (now ? rank(now) : 0))
    .sort((a, b) => rank(a) - rank(b))
}

/** Tiers a plan id allows, from the catalog (free when unknown). */
export function tiersOf(catalog: Catalog, plan: PlanId): Tier[] {
  return catalog.plans.find((entry) => entry.id === plan)?.tiers ?? ['standard']
}
