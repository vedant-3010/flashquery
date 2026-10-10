import { ArrowRight, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, Redirect, useSearch } from 'wouter'
import { nextPath, paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AccountsOff } from '@/features/account/AccountsOff'
import { AuthLayout } from '@/features/account/AuthLayout'
import type { Showcase } from '@/features/account/AuthShowcase'
import { FormError } from '@/features/account/FormError'
import { GitHubIcon, GoogleIcon } from '@/features/account/ProviderIcons'
import { FIELD, PILL, PILL_OUTLINE, TEXT_LINK } from '@/features/account/styles'
import { useAuthAction } from '@/features/account/useAuthAction'
import { useAuthStore } from '@/stores/auth'

export const MIN_PASSWORD = 8

const SHOWCASE: Showcase = { lead: 'Meet your analyst.', line: 'It lives in this tab.' }

/** `/app/register` (F-ACCT-01, D115): a name, email and password, or Google and GitHub. */
export function RegisterPage() {
  const status = useAuthStore((state) => state.status)
  const auth = useAuthStore.getState
  const search = useSearch()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmTo, setConfirmTo] = useState<string | null>(null)
  const { pending, error, run } = useAuthAction()

  if (status === 'off') return <AccountsOff />
  if (status === 'signed-in') return <Redirect to={nextPath(search)} replace />
  if (confirmTo) {
    return (
      <AuthLayout
        title="Confirm your email"
        description={`We sent a link to ${confirmTo}.`}
        showcase={SHOWCASE}
      >
        <p className="flex items-start gap-2.5 text-[15px] text-ink-muted">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
          Open it in this browser to finish creating your account.
        </p>
      </AuthLayout>
    )
  }

  const submit = async () => {
    const address = email.trim()
    const next = await run(() => auth().signUp(name, address, password))
    if (next === 'confirm-email') setConfirmTo(address)
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Free. Save dashboards to your account and share them with your team. Your files never leave this device."
      showcase={SHOWCASE}
      footer={
        <>
          <p>
            Have an account?{' '}
            <Link href={`${paths.login}${search ? `?${search}` : ''}`} className={TEXT_LINK}>
              Sign in
            </Link>
          </p>
          <p>
            <Link href={paths.try} className="group inline-flex items-center gap-1 hover:text-ink">
              Or try it free with sample data, no account needed
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </p>
        </>
      }
    >
      <div className="grid gap-2.5">
        <Button
          variant="outline"
          className={PILL_OUTLINE}
          disabled={pending}
          onClick={() => void run(() => auth().signInWith('google'))}
        >
          <GoogleIcon />
          Sign up with Google
        </Button>
        <Button
          variant="outline"
          className={PILL_OUTLINE}
          disabled={pending}
          onClick={() => void run(() => auth().signInWith('github'))}
        >
          <GitHubIcon />
          Sign up with GitHub
        </Button>
      </div>
      <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.08em] text-ink-faint uppercase">
        <span className="h-px flex-1 bg-hairline" />
        or with email
        <span className="h-px flex-1 bg-hairline" />
      </div>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="register-name">Name</Label>
          <Input
            id="register-name"
            autoComplete="name"
            required
            maxLength={80}
            className={FIELD}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            className={FIELD}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="register-password">Password</Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            className={FIELD}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="register-password-hint"
          />
          <p id="register-password-hint" className="text-xs text-ink-muted">
            At least {MIN_PASSWORD} characters.
          </p>
        </div>
        <FormError error={error} />
        <Button type="submit" className={PILL} disabled={pending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
