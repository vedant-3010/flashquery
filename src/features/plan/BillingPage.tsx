import { CircleCheck, CreditCard, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Redirect } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { AccountsOff } from '@/features/account/AccountsOff'
import { CenteredLayout } from '@/features/account/CenteredLayout'
import { FormError } from '@/features/account/FormError'
import { UpgradeDialog } from '@/features/plan/UpgradeDialog'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { manageBilling, usePlanStore } from '@/stores/plan'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

/** How long to wait for Dodo's webhook after checkout before saying it may take a moment. */
const CONFIRM_MS = 30_000

/**
 * `/app/account/billing` (F-PLAN-04): the plan, this period's questions, Starter and Pro, and
 * Dodo's customer portal. Checkout comes back here (`?checkout=done`) and waits for the webhook to
 * bring the paid plan.
 */
export function BillingPage() {
  const status = useAuthStore((state) => state.status)
  if (status === 'off') return <AccountsOff />
  if (status === 'guest') return <Redirect to={`${paths.login}?next=${paths.billing}`} replace />
  return <Billing />
}

function Billing() {
  const quota = usePlanStore((state) => state.quota)
  const catalogStatus = usePlanStore((state) => state.catalogStatus)
  const openUpgrade = usePlanStore((state) => state.openUpgrade)
  const locale = useSettingsStore((state) => state.locale)
  const [returning] = useState(
    () => new URLSearchParams(window.location.search).get('checkout') === 'done',
  )
  const [waiting, setWaiting] = useState(returning)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)

  // Back from checkout: the paid plan arrives with Dodo's webhook, usually within seconds.
  useEffect(() => {
    if (!returning) return
    let done = false
    const started = Date.now()
    const poll = async () => {
      while (!done && Date.now() - started < CONFIRM_MS) {
        await usePlanStore.getState().refreshQuota()
        const plan = usePlanStore.getState().quota?.plan
        if (plan !== undefined && plan !== 'free') break
        await new Promise((resolve) => setTimeout(resolve, 2_000))
      }
      if (!done) setWaiting(false)
    }
    void poll()
    return () => {
      done = true
    }
  }, [returning])

  const portal = () => {
    setPending(true)
    setError(null)
    manageBilling().catch((caught: unknown) => {
      setError(toAppError(caught).toJSON())
      setPending(false)
    })
  }

  const paid = quota !== null && quota.plan !== 'free'
  return (
    <CenteredLayout
      title="Plan and billing"
      description="HushGlance AI: hosted models, no key needed."
      footer={
        <p>
          <Link href={paths.account} className="hover:underline">
            Your account
          </Link>
          {' · '}
          <Link href={paths.home} className="hover:underline">
            Your projects
          </Link>
        </p>
      }
    >
      {catalogStatus === 'unavailable' ? (
        <p className="text-sm text-muted-foreground">
          HushGlance AI isn’t offered on this deployment. Add your own AI key in Settings.
        </p>
      ) : !quota ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading your plan…
        </p>
      ) : (
        <>
          {returning && (
            <p role="status" className="flex items-center gap-2 text-sm">
              {paid ? (
                <>
                  <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                  You’re on {quota.label}. Thank you!
                </>
              ) : waiting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  Payment received. Setting up your plan…
                </>
              ) : (
                'Your plan is taking longer than usual to arrive. Reload this page in a minute.'
              )}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-medium">{quota.label}</dd>
            <dt className="text-muted-foreground">
              {quota.period === 'lifetime' ? 'Free questions' : 'This month'}
            </dt>
            <dd>
              <span className="tabular-nums">
                {quota.used} of {quota.questions} used
              </span>
            </dd>
            {quota.renews_at && (
              <>
                <dt className="text-muted-foreground">
                  {quota.status === 'cancelled' ? `${quota.label} until` : 'Renews'}
                </dt>
                <dd>{formatDate(quota.renews_at, locale)}</dd>
              </>
            )}
          </dl>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {quota.plan !== 'pro' && (
              <Button onClick={() => openUpgrade('chosen')}>
                {quota.plan === 'starter' ? 'Upgrade to Pro' : 'See plans'}
              </Button>
            )}
            {quota.has_customer && (
              <Button variant="outline" disabled={pending} onClick={portal}>
                {pending ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <CreditCard aria-hidden />
                )}
                Manage subscription
              </Button>
            )}
          </div>
          <FormError error={error} />
          <p className="text-xs text-muted-foreground">
            Payments, invoices and refunds are handled by Dodo Payments, our merchant of record.
            Your own AI key keeps working on every plan, free.
          </p>
        </>
      )}
      <UpgradeDialog />
    </CenteredLayout>
  )
}
