import { Check, KeyRound, LoaderCircle, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormError } from '@/features/account/FormError'
import { cn } from '@/lib/utils'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { formatBytes, formatDate, formatMoment } from '@/lib/format'
import {
  plannerModels,
  upgradesFrom,
  type BillingInterval,
  type Catalog,
  type PaidPlanId,
  type Plan,
} from '@/lib/plans'
import { subscribe, usePlanStore } from '@/stores/plan'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

/** What a plan includes, from the catalog (so the dialog follows the plans table). */
function pointsFor(plan: Plan, catalog: Catalog, locale: string): string[] {
  const premium = plannerModels(catalog).filter((model) => model.tier === 'premium')
  const standard = plannerModels(catalog).filter((model) => model.tier === 'standard')
  return [
    `${plan.questions} questions a month, on any device you sign in to`,
    plan.tiers.includes('premium') && premium.length > 0
      ? `Premium models too (${premium.map((model) => model.label).join(', ')}), ${premium[0]?.weight ?? 5} questions each`
      : `Standard models: ${standard.map((model) => model.label).join(', ')}`,
    `${formatBytes(plan.storage_bytes, locale)} of encrypted storage for your files and projects`,
    'Zero data retention on every request: no one keeps your prompts',
  ]
}

/** What a free account adds for a guest (D125). */
const ACCOUNT_POINTS = [
  '3 more questions with HushGlance AI, then Starter or Pro if you want more',
  'Your projects saved encrypted: only you can read them, on any device',
  'Share dashboards by invite or a view-only link',
]

/**
 * Starter and Pro (F-PLAN-03): opened when the free questions run out, for a premium model, or
 * from the meter. It offers the plans above the current one; Dodo hosts the checkout (no payment
 * script on our pages, D120), and Starter → Pro is a prorated plan change. A guest (D125) is
 * offered an account first: plans need one. "Use your own key" is always the free way on.
 */
export function UpgradeDialog() {
  const reason = usePlanStore((state) => state.upgrade)
  const close = usePlanStore((state) => state.closeUpgrade)
  const catalog = usePlanStore((state) => state.catalog)
  const quota = usePlanStore((state) => state.quota)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const toast = useToastStore((state) => state.show)
  const locale = useSettingsStore((state) => state.locale)
  const [interval, setBilling] = useState<BillingInterval>('month')
  const [pending, setPending] = useState<PaidPlanId | null>(null)
  const [error, setError] = useState<AppErrorData | null>(null)
  const [location] = useLocation()

  const current = quota?.plan ?? 'free'
  const guest = current === 'guest'
  // A guest's next free question: when the oldest counted one stops counting.
  const backAt =
    guest && quota?.renews_at ? formatMoment(Date.parse(quota.renews_at), locale) : null
  // A premium model needs a plan that has it; otherwise every plan above this one.
  const offers = catalog
    ? upgradesFrom(catalog, current).filter(
        (plan) => reason !== 'model_not_in_plan' || plan.tiers.includes('premium'),
      )
    : []
  const renews = quota?.renews_at ? formatDate(quota.renews_at, locale) : null

  const title =
    reason === 'model_not_in_plan'
      ? 'That model is part of Pro'
      : reason === 'quota_reached'
        ? guest
          ? 'You’ve used today’s free questions'
          : current === 'free'
            ? 'You’ve used your free questions'
            : 'You’ve used this month’s questions'
        : guest
          ? 'Ask more with a free account'
          : 'Choose a plan'
  const description = guest
    ? `${backAt ? `Your next free question is back at ${backAt}.` : 'Free questions come back after a day.'} A free account gives you more, and Starter or Pro after that; your own AI key works too.`
    : offers.length === 0
      ? renews
        ? `Your questions renew on ${renews}. Until then, your own AI key keeps you going.`
        : 'Your own AI key keeps you going until your questions renew.'
      : current === 'starter'
        ? `Move to Pro now (you pay the difference for the rest of this month)${renews && reason === 'quota_reached' ? `, or wait until your questions renew on ${renews}` : ''}.`
        : 'Keep asking with HushGlance AI, or bring your own key: both stay private.'

  const choose = (plan: PaidPlanId) => {
    setPending(plan)
    setError(null)
    subscribe(plan, interval)
      .then((now) => {
        // A plan change made in place (the browser stays here).
        if (now === null) return
        setPending(null)
        close()
        toast(
          now === plan
            ? `You’re on ${plan === 'pro' ? 'Pro' : 'Starter'}.`
            : 'Plan change requested: it can take a moment to show.',
        )
      })
      .catch((caught: unknown) => {
        setError(toAppError(caught).toJSON())
        setPending(null)
      })
  }

  return (
    <Dialog
      open={reason !== null}
      onOpenChange={(open) => {
        if (!open) {
          close()
          setError(null)
        }
      }}
    >
      <DialogContent
        className={cn(
          'max-h-[90dvh] overflow-y-auto',
          offers.length > 1 ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {guest && (
          <div className="grid gap-3">
            <ul className="grid gap-1.5 text-sm">
              {ACCOUNT_POINTS.map((line) => (
                <li key={line} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link
                  href={`${paths.register}?next=${encodeURIComponent(location)}`}
                  onClick={close}
                >
                  <UserPlus aria-hidden />
                  Create a free account
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`${paths.login}?next=${encodeURIComponent(location)}`} onClick={close}>
                  Sign in
                </Link>
              </Button>
            </div>
          </div>
        )}
        {catalog && offers.length > 0 && (
          <div className="grid gap-3">
            {current === 'free' && (
              <div
                role="group"
                aria-label="Billing period"
                className="inline-flex w-fit rounded-lg border p-0.5 text-sm"
              >
                {(['month', 'year'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={interval === option}
                    onClick={() => setBilling(option)}
                    className={cn(
                      'rounded-md px-3 py-1 transition-colors',
                      interval === option
                        ? 'bg-secondary font-medium text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option === 'month' ? 'Monthly' : 'Yearly · 2 months free'}
                  </button>
                ))}
              </div>
            )}
            <div className={cn('grid gap-3', offers.length > 1 && 'sm:grid-cols-2')}>
              {offers.map((plan) => {
                const price = interval === 'year' ? plan.price_yearly_usd : plan.price_monthly_usd
                return (
                  <section
                    key={plan.id}
                    aria-label={plan.label}
                    className={cn(
                      'flex flex-col gap-3 rounded-xl border p-4',
                      plan.id === 'pro' && offers.length > 1 && 'border-brand/50',
                    )}
                  >
                    <p className="flex items-baseline gap-1.5">
                      <span className="font-medium">{plan.label}</span>
                      <span className="ml-auto text-2xl font-semibold tabular-nums">
                        ${price ?? '—'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {interval === 'year' ? 'a year' : 'a month'}
                      </span>
                    </p>
                    <ul className="grid flex-1 gap-1.5 text-sm">
                      {pointsFor(plan, catalog, locale).map((line) => (
                        <li key={line} className="flex gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                          {line}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant={plan.id === 'pro' ? 'default' : 'outline'}
                      disabled={pending !== null}
                      onClick={() => choose(plan.id)}
                    >
                      {pending === plan.id && <LoaderCircle className="animate-spin" aria-hidden />}
                      {current === 'starter' ? `Switch to ${plan.label}` : `Choose ${plan.label}`}
                    </Button>
                  </section>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Payments are handled by Dodo Payments, our merchant of record: HushGlance never sees
              your card. Cancel any time; a plan lasts to the end of what you paid for.
            </p>
          </div>
        )}
        <FormError error={error} />

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              close()
              useSettingsStore.getState().setAiSource('own')
              openSettings(true)
            }}
          >
            <KeyRound aria-hidden />
            Use your own key
          </Button>
          <Button variant="ghost" onClick={close}>
            Not now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
