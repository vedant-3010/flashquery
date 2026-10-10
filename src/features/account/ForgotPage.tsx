import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AccountsOff } from '@/features/account/AccountsOff'
import { AuthLayout } from '@/features/account/AuthLayout'
import { FormError } from '@/features/account/FormError'
import { FIELD, PILL, TEXT_LINK } from '@/features/account/styles'
import { useAuthAction } from '@/features/account/useAuthAction'
import { useAuthStore } from '@/stores/auth'

/** `/app/forgot` (F-ACCT-01): emails a link to choose a new password. */
export function ForgotPage() {
  const status = useAuthStore((state) => state.status)
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { pending, error, run } = useAuthAction()

  if (status === 'off') return <AccountsOff />
  const back = (
    <p>
      <Link href={paths.login} className={TEXT_LINK}>
        Back to sign in
      </Link>
    </p>
  )
  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={back}>
        <p className="flex items-start gap-2 text-[15px] text-ink-muted">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          If {sentTo} has an account, a link to choose a new password is on its way.
        </p>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout
      title="Reset your password"
      description="We’ll email you a link to choose a new one."
      footer={back}
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const address = email.trim()
          void run(async () => {
            await useAuthStore.getState().sendPasswordReset(address)
            return true
          }).then((sent) => {
            if (sent) setSentTo(address)
          })
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            className={FIELD}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <FormError error={error} />
        <Button type="submit" className={PILL} disabled={pending}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
