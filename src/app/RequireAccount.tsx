import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Redirect, useLocation, useSearch } from 'wouter'
import { loginPath } from '@/app/paths'
import { useAuthStore } from '@/stores/auth'

/**
 * Where accounts are set up, the app asks for one (D115): Home, projects and new projects. The try
 * link and its sample project, and the benchmark, stay open; without an account service everything
 * is open. After signing in, the page that asked comes back.
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)
  const [location] = useLocation()
  const search = useSearch()
  if (status === 'off' || status === 'signed-in') return children
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
