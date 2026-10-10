import { ArrowRight, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, Redirect, useSearch } from 'wouter'
import { nextPath, paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AccountsOff } from '@/features/account/AccountsOff'
import { AuthLayout } from '@/features/account/AuthLayout'
import { FormError } from '@/features/account/FormError'
import { GitHubIcon, GoogleIcon } from '@/features/account/ProviderIcons'
import { FIELD, PILL, PILL_OUTLINE, TEXT_LINK } from '@/features/account/styles'
import { useAuthAction } from '@/features/account/useAuthAction'
import { useAuthStore } from '@/stores/auth'

/**
 * `/app/login` (F-ACCT-01, D115): Google, GitHub, email and password, or an email link; then back
 * to the page that asked (`?next=`), else Home. The try link needs no account.
 */
export function LoginPage() {
  const status = useAuthStore((state) => state.status)
  const auth = useAuthStore.getState
  const search = useSearch()
  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const { pending, error, run, setError } = useAuthAction()
  const keepNext = search ? `?${search}` : ''

  if (status === 'off') return <AccountsOff />
  if (status === 'signed-in') return <Redirect to={nextPath(search)} replace />

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" description={`We sent a sign-in link to ${sentTo}.`}>
        <p className="flex items-start gap-2.5 text-[15px] text-ink-muted">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
          Open it in this browser to finish signing in. It works once and expires within an hour.
        </p>
        <Button variant="outline" className={PILL_OUTLINE} onClick={() => setSentTo(null)}>
          Use another way
        </Button>
      </AuthLayout>
    )
  }

  const submit = async () => {
    const address = email.trim()
    if (mode === 'password') {
      // Signed in: the status changes and the page moves on.
      await run(() => auth().signIn(address, password))
      return
    }
    const sent = await run(async () => {
      await auth().sendSignInLink(address)
      return true
    })
    if (sent) setSentTo(address)
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Your projects are waiting. Files and queries stay in this browser either way."
      footer={
        <>
          <p>
            New here?{' '}
            <Link href={`${paths.register}${keepNext}`} className={TEXT_LINK}>
              Create an account
            </Link>
          </p>
          <p>
            <Link href={paths.try} className="group inline-flex items-center gap-1 hover:text-ink">
              Or try it on 1M rows, no account needed
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
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className={PILL_OUTLINE}
          disabled={pending}
          onClick={() => void run(() => auth().signInWith('github'))}
        >
          <GitHubIcon />
          Continue with GitHub
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
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            className={FIELD}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        {mode === 'password' && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Password</Label>
              <Link href={paths.forgot} className="text-xs text-ink-muted hover:text-ink">
                Forgot password?
              </Link>
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              className={FIELD}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        )}
        <FormError error={error} />
        <Button type="submit" className={PILL} disabled={pending}>
          {mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto justify-self-center p-0 text-ink-muted hover:text-ink"
          onClick={() => {
            setError(null)
            setMode(mode === 'password' ? 'link' : 'password')
          }}
        >
          {mode === 'password' ? 'Email me a sign-in link instead' : 'Use a password instead'}
        </Button>
      </form>
    </AuthLayout>
  )
}
