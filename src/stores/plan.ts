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

// HushGlance AI's plan (F-PLAN-01…04): the hosted models, what's left of the questions, and the
// upgrade dialog. The calls live in src/platform/ (a lazy chunk, D114): this module is the only way
// in (lint enforces it), and it loads them only for a signed-in user, or for a guest who turned
// HushGlance AI on (D125, F-PLAN-06: guestAi.ts, no supabase-js).

const plans = () => import('@/platform/plans')
const hosted = () => import('@/platform/hostedAi')
const guests = () => import('@/platform/guestAi')

export type { Meter }

/** Whose questions these are: a signed-in user's plan, or a guest's day (counted per address). */
export type Audience = 'account' | 'guest'

/** Who HushGlance AI is for right now, or null (signed out without it, checking, or accounts off). */
function audienceNow(): Audience | null {
  const status = useAuthStore.getState().status
  if (status === 'signed-in') return 'account'
  if (status === 'guest' && useSettingsStore.getState().guestAi) return 'guest'
  return null
}

/** Why the upgrade dialog opened. */
export type UpgradeReason = 'quota_reached' | 'model_not_in_plan' | 'chosen'

/** 'unavailable': this deployment offers no hosted models (or the service couldn't be reached). */
type CatalogStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

interface PlanState {
  /** Whose plan is loaded (or loading); null before anything is. */
  audience: Audience | null
  catalogStatus: CatalogStatus
  catalog: Catalog | null
  quota: Quota | null
  upgrade: UpgradeReason | null
  /** The model list and the quota, for the current audience; once (later calls wait for it). */
  load: () => Promise<void>
  refreshQuota: () => Promise<void>
  /** From the proxy's x-fq-remaining header after each hosted call. */
  setRemaining: (remaining: number) => void
  openUpgrade: (reason: UpgradeReason) => void
  closeUpgrade: () => void
  reset: () => void
}

/** The load in progress or done, and for whom: a newer one (or a reset) makes it stale. */
let loading: { audience: Audience; promise: Promise<void> } | null = null

/** The catalog and quota for one audience: an account's plan, or a guest's day. */
async function fetchPlan(audience: Audience): Promise<[Catalog, Quota]> {
  if (audience === 'guest') {
    const api = await guests()
    return Promise.all([api.loadGuestCatalog(), api.loadGuestQuota()])
  }
  const api = await plans()
  return Promise.all([api.loadCatalog(), api.loadQuota()])
}

export const usePlanStore = create<PlanState>()((set, get) => ({
  audience: null,
  catalogStatus: 'idle',
  catalog: null,
  quota: null,
  upgrade: null,
  load: () => {
    const audience = audienceNow()
    if (!audience) return Promise.resolve()
    if (loading?.audience === audience) return loading.promise
    const entry: { audience: Audience; promise: Promise<void> } = {
      audience,
      promise: Promise.resolve(),
    }
    loading = entry
    set({ audience, catalogStatus: 'loading', catalog: null, quota: null })
    entry.promise = (async () => {
      try {
        const [catalog, quota] = await fetchPlan(audience)
        if (loading !== entry) return
        const listed = catalog.models.some((model) => model.tier !== 'fast')
        set({ catalog, quota, catalogStatus: listed ? 'ready' : 'unavailable' })
      } catch (error) {
        if (loading !== entry) return
        // No hosted AI here (not deployed, guests off, or offline): own keys and the demo work
        // as before.
        console.warn('HushGlance: hosted AI is unavailable', toAppError(error).message)
        set({ catalogStatus: 'unavailable' })
      }
    })()
    return entry.promise
  },
  refreshQuota: async () => {
    const audience = get().audience
    if (!audience || audience !== audienceNow()) return
    try {
      const quota =
        audience === 'guest'
          ? await (await guests()).loadGuestQuota()
          : await (await plans()).loadQuota()
      if (get().audience === audience) set({ quota })
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
    set({ audience: null, catalogStatus: 'idle', catalog: null, quota: null, upgrade: null })
  },
}))

let started = false

/**
 * Follows the account and a guest's choice (once, at app start): loads the plan on sign-in or
 * when a guest turns HushGlance AI on, forgets it on sign-out or when they turn it off.
 */
export function startPlans(): void {
  if (started) return
  started = true
  const follow = () => {
    if (useAuthStore.getState().status === 'checking') return
    const audience = audienceNow()
    const store = usePlanStore.getState()
    if (audience === null) {
      if (store.audience !== null || store.catalogStatus !== 'idle') store.reset()
    } else if (store.audience !== audience) {
      store.reset()
      void usePlanStore.getState().load()
    }
  }
  follow()
  useAuthStore.subscribe((state, previous) => {
    if (state.status !== previous.status) follow()
  })
  useSettingsStore.subscribe((state, previous) => {
    if (state.guestAi !== previous.guestAi) follow()
  })
}

/**
 * Whether hosted AI is on offer to this person right now: signed in, or a guest who turned it on,
 * and models are listed.
 */
export async function hostedAvailable(): Promise<boolean> {
  const audience = audienceNow()
  if (!audience) return false
  await usePlanStore.getState().load()
  const state = usePlanStore.getState()
  return state.audience === audience && state.catalogStatus === 'ready'
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
  const { catalog, quota, audience } = usePlanStore.getState()
  const planner = catalog ? hostedPlanner(catalog, quota) : null
  if (!catalog || !planner) throw new Error('No hosted model is available.')
  // A guest's questions go without a session, and supabase-js never loads for them.
  const create =
    audience === 'guest'
      ? (await guests()).createGuestProvider
      : (await hosted()).createHostedProvider
  return create({
    model: planner.id,
    summaryModel: summaryModelFor(catalog, planner),
    effort,
    meter,
    onRemaining: (remaining) => usePlanStore.getState().setRemaining(remaining),
    onRefusal: (code) => {
      if (code === 'quota_reached' || code === 'model_not_in_plan') {
        // The dialog says when questions come back (renews_at): read it fresh.
        if (code === 'quota_reached') void usePlanStore.getState().refreshQuota()
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
  const now = usePlanStore.getState().quota?.plan
  // Checkout is for accounts: a guest's quota is never a plan.
  return now === undefined || now === 'guest' ? null : now
}

/** Sends the browser to Dodo's customer portal (payment method, invoices, cancelling). */
export async function manageBilling(): Promise<void> {
  window.location.assign(await (await plans()).billingPortal())
}
