import { LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/features/account/AuthLayout'
import { PILL } from '@/features/account/styles'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/**
 * `/app/auth/callback` (F-ACCT-01): email links and Google/GitHub come back here with ?code=; loading
 * the service exchanges it for a session (PKCE), then Home.
 */
export function AuthCallbackPage() {
  const [, navigate] = useLocation()
  // The provider said no (cancelled, or the app isn't allowed): it says why in the URL.
  const [refused] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('error_description') ?? params.get('error')
  })
  const [error, setError] = useState<string | null>(null)
  const failed = refused ?? error
  // Strict mode runs effects twice in development: finish (and greet) once.
  const started = useRef(false)

  useEffect(() => {
    if (refused || started.current) return
    started.current = true
    void useAuthStore
      .getState()
      .connect()
      .then(
        (account) => {
          if (!account) return setError('The link didn’t sign you in. It may have expired.')
          useToastStore.getState().show(`Signed in as ${account.name || account.email}.`)
          navigate(paths.home, { replace: true })
        },
        () =>
          setError(
            'The link didn’t sign you in. It may have expired, or was opened in another browser.',
          ),
      )
  }, [navigate, refused])

  if (!failed) {
    return (
      <AuthLayout title="Signing you in">
        <p className="flex items-center gap-2 text-[15px] text-ink-muted" aria-busy="true">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Finishing sign-in…
        </p>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Couldn’t sign you in" description={failed}>
      <Button asChild className={PILL}>
        <Link href={paths.login}>Back to sign in</Link>
      </Button>
    </AuthLayout>
  )
}
