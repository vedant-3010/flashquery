import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Redirect, useLocation, useSearch } from 'wouter'
import { SIGN_IN_REQUIRED } from '@/app/access'
import { loginPath } from '@/app/paths'
import { useAuthStore } from '@/stores/auth'

/**
 * Pages that need an account where accounts are set up: a dashboard shared with you, and, with
 * `openToGuests`, Home and projects only when the build asks for sign-in first (D115). Otherwise
 * guests use those on this device (D125). Without an account service everything is open. After
 * signing in, the page that asked comes back.
 */
export function RequireAccount({
  children,
  openToGuests = false,
}: {
  children: ReactNode
  openToGuests?: boolean
}) {
  const status = useAuthStore((state) => state.status)
  const [location] = useLocation()
  const search = useSearch()
  if (status === 'off' || status === 'signed-in') return children
  if (status === 'guest' && openToGuests && !SIGN_IN_REQUIRED) return children
  if (status === 'checking') {
    return (
      <div
        className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground"
        aria-busy="true"
      >
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Checking your sign-in…
      </div>
    )
  }
  return <Redirect to={loginPath(search ? `${location}?${search}` : location)} replace />
}
