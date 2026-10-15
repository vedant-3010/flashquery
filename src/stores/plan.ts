import { create } from 'zustand'
import type { LLMProvider } from '@/ai/providers'
import type { Effort } from '@/ai/schemas'
import { toAppError } from '@/lib/errors'
import {
  pickHostedModel,
  summaryModelFor,
  tiersOf,
  type BillingInterval,
  type Catalog,
  type HostedModel,
  type PaidPlanId,
  type PlanId,
  type Quota,
} from '@/lib/plans'
import type { Meter } from '@/platform/hostedAi'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

// HushGlance AI's plan (F-PLAN-01…04): the hosted models, what's left of the signed-in user's
// questions, and the upgrade dialog. The calls live in src/platform/ (a lazy chunk, D114): this
// module is the only way in (lint enforces it), and it loads them only for a signed-in user.

const plans = () => import('@/platform/plans')
const hosted = () => import('@/platform/hostedAi')

export type { Meter }

/** Why the upgrade dialog opened. */
export type UpgradeReason = 'quota_reached' | 'model_not_in_plan' | 'chosen'

/** 'unavailable': this deployment offers no hosted models (or the service couldn't be reached). */
type CatalogStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

interface PlanState {
  catalogStatus: CatalogStatus
  catalog: Catalog | null
  quota: Quota | null
  upgrade: UpgradeReason | null
  /** The model list and the user's quota; once per sign-in (later calls wait for the same load). */
  load: () => Promise<void>
  refreshQuota: () => Promise<void>
  /** From the proxy's x-fq-remaining header after each hosted call. */
  setRemaining: (remaining: number) => void
  openUpgrade: (reason: UpgradeReason) => void
  closeUpgrade: () => void
  reset: () => void
}

let loading: Promise<void> | null = null

export const usePlanStore = create<PlanState>()((set, get) => ({
  catalogStatus: 'idle',
  catalog: null,
  quota: null,
  upgrade: null,
  load: () => {
    loading ??= (async () => {
      set({ catalogStatus: 'loading' })
      try {
        const api = await plans()
        const [catalog, quota] = await Promise.all([api.loadCatalog(), api.loadQuota()])
        const listed = catalog.models.some((model) => model.tier !== 'fast')
        set({ catalog, quota, catalogStatus: listed ? 'ready' : 'unavailable' })
      } catch (error) {
        // No hosted AI here (not deployed, or offline): own keys and the demo work as before.
        console.warn('HushGlance: hosted AI is unavailable', toAppError(error).message)
        set({ catalogStatus: 'unavailable' })
      }
    })()
    return loading
  },
  refreshQuota: async () => {
    if (useAuthStore.getState().status !== 'signed-in') return
    try {
      set({ quota: await (await plans()).loadQuota() })
    } catch (error) {
      console.warn('HushGlance: could not refresh the plan', toAppError(error).message)
    }
  },
  setRemaining: (remaining) => {
    const quota = get().quota
    if (!quota) return
    set({ quota: { ...quota, remaining, used: Math.max(quota.questions - remaining, 0) } })
  },
  openUpgrade: (upgrade) => set({ upgrade }),
  closeUpgrade: () => set({ upgrade: null }),
  reset: () => {
    loading = null
    set({ catalogStatus: 'idle', catalog: null, quota: null, upgrade: null })
  },
}))

let started = false

/** Follows the account (once, at app start): loads the plan on sign-in, forgets it on sign-out. */
export function startPlans(): void {
  if (started) return
  started = true
  const follow = (status: string) => {
    if (status === 'signed-in') void usePlanStore.getState().load()
    else if (status === 'guest' || status === 'off') usePlanStore.getState().reset()
  }
  follow(useAuthStore.getState().status)
  useAuthStore.subscribe((state, previous) => {
    if (state.status !== previous.status) follow(state.status)
  })
}

/** Whether hosted AI is on offer to this user right now (signed in, and models are listed). */
export async function hostedAvailable(): Promise<boolean> {
  if (useAuthStore.getState().status !== 'signed-in') return false
  await usePlanStore.getState().load()
  return usePlanStore.getState().catalogStatus === 'ready'
}

/** The planner a hosted question will use (the chosen model, if the plan allows it). */
export function hostedPlanner(catalog: Catalog, quota: Quota | null): HostedModel | null {
  const tiers = quota?.tiers ?? tiersOf(catalog, 'free')
  return pickHostedModel(catalog, useSettingsStore.getState().hostedModel, tiers)
}

/** A fresh meter: one hosted question (F-PLAN-02). */
export function newMeter(kind: Meter['kind']): Meter {
  return { id: crypto.randomUUID(), kind }
}

/** The hosted provider for one question (callers check hostedAvailable() first). */
export async function hostedProvider(effort: Effort, meter: Meter): Promise<LLMProvider> {
  const { catalog, quota } = usePlanStore.getState()
  const planner = catalog ? hostedPlanner(catalog, quota) : null
  if (!catalog || !planner) throw new Error('No hosted model is available.')
  const { createHostedProvider } = await hosted()
  return createHostedProvider({
    model: planner.id,
    summaryModel: summaryModelFor(catalog, planner),
    effort,
    meter,
    onRemaining: (remaining) => usePlanStore.getState().setRemaining(remaining),
    onRefusal: (code) => {
      if (code === 'quota_reached' || code === 'model_not_in_plan') {
        usePlanStore.getState().openUpgrade(code)
      }
    },
  })
}

/**
 * Starter or Pro: sends the browser to Dodo's hosted checkout, or, for a plan change Dodo made at
 * once (Starter → Pro), waits for the webhook to bring the new plan. Returns the plan it ended on
 * when it didn't leave the page.
 */
export async function subscribe(
  plan: PaidPlanId,
  interval: BillingInterval,
): Promise<PlanId | null> {
  const result = await (await plans()).startCheckout(plan, interval)
  if ('url' in result) {
    window.location.assign(result.url)
    return null
  }
  const store = usePlanStore.getState()
  for (let wait = 0; wait < 15; wait += 1) {
    await store.refreshQuota()
    if (usePlanStore.getState().quota?.plan === plan) break
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  return usePlanStore.getState().quota?.plan ?? null
}

/** Sends the browser to Dodo's customer portal (payment method, invoices, cancelling). */
export async function manageBilling(): Promise<void> {
  window.location.assign(await (await plans()).billingPortal())
}
