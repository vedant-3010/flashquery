import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AccountsOff } from '@/features/account/AccountsOff'
import { AuthLayout } from '@/features/account/AuthLayout'
import { FormError } from '@/features/account/FormError'
import { MIN_PASSWORD } from '@/features/account/RegisterPage'
import { FIELD, PILL } from '@/features/account/styles'
import { useAuthAction } from '@/features/account/useAuthAction'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/** `/app/reset` (F-ACCT-01): the reset link signs them in; then they choose a new password. */
export function ResetPage() {
  const status = useAuthStore((state) => state.status)
  const [, navigate] = useLocation()
  const [checked, setChecked] = useState(false)
  const [password, setPassword] = useState('')
  const { pending, error, run } = useAuthAction()

  useEffect(() => {
    if (useAuthStore.getState().status === 'off') return
    // Loading the service reads the link's ?code= and signs in for the reset.
    void useAuthStore
      .getState()
      .connect()
      .catch(() => null)
      .finally(() => setChecked(true))
  }, [])

  if (status === 'off') return <AccountsOff />
  if (!checked) {
    return (
      <AuthLayout title="Reset your password">
        <p className="flex items-center gap-2 text-[15px] text-ink-muted" aria-busy="true">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Checking the link…
        </p>
      </AuthLayout>
    )
  }
  if (status !== 'signed-in') {
    return (
      <AuthLayout
        title="This link doesn’t work any more"
        description="Reset links work once and expire. Ask for a new one."
      >
        <Button asChild className={PILL}>
          <Link href={paths.forgot}>Send a new link</Link>
        </Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Choose a new password">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await useAuthStore.getState().setPassword(password)
            return true
          }).then((done) => {
            if (!done) return
            useToastStore.getState().show('Password changed.')
            navigate(paths.home, { replace: true })
          })
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="reset-password">New password</Label>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            className={FIELD}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <FormError error={error} />
        <Button type="submit" className={PILL} disabled={pending}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  )
}
