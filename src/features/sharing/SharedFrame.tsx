import { ArrowRight, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { ThemeMenu } from '@/app/ThemeMenu'
import { BrandMark } from '@/components/BrandMark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Role } from '@/dashboard/cloud'
import { AccountMenu } from '@/features/account/AccountMenu'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { formatAgo } from '@/lib/format'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const ACCESS: Record<Role | 'link', string> = {
  owner: 'Yours',
  editor: 'You can edit',
  viewer: 'View only',
  link: 'View only',
}

/**
 * The page around a shared dashboard (F-SHARE-05): the brand, the account, and the dashboard's
 * name, who shared it, when it was updated and your access. Visitors without an account get a way
 * to try flashQuery themselves.
 */
export function SharedFrame({
  title,
  ownerName,
  updatedAt,
  role,
  actions,
  onLeave,
  children,
}: {
  title?: string
  ownerName?: string
  updatedAt?: string
  /** null: opened with a view-only link. */
  role?: Role | null
  actions?: ReactNode
  /** Members: stop seeing it. */
  onLeave?: () => void
  children: ReactNode
}) {
  const theme = useResolvedTheme()
  const locale = useSettingsStore((state) => state.locale)
  const signedIn = useAuthStore((state) => state.status === 'signed-in')
  const brand = (
    <>
      <BrandMark className="size-[18px] text-primary" onDark={theme === 'dark'} />
      flashQuery
    </>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        {signedIn ? (
          <Link href={paths.home} className="flex items-center gap-1.5 font-semibold">
            {brand}
          </Link>
        ) : (
          <a href="/" className="flex items-center gap-1.5 font-semibold">
            {brand}
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!signedIn && (
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <a href="/">
                Analyze your own data, privately
                <ArrowRight aria-hidden />
              </a>
            </Button>
          )}
          <ThemeMenu />
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-7xl content-start gap-4 px-4 py-6 sm:px-6">
        {title !== undefined && (
          <div className="flex flex-wrap items-start gap-3">
            <div className="grid min-w-0 flex-1 gap-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {ownerName ? `Shared by ${ownerName}` : 'Shared'}
                  {updatedAt && ` · updated ${formatAgo(Date.parse(updatedAt), locale)}`}
                </span>
                <Badge variant="outline">{ACCESS[role ?? 'link']}</Badge>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {actions}
              {onLeave && (
                <Button size="sm" variant="ghost" onClick={onLeave}>
                  <LogOut aria-hidden />
                  Leave
                </Button>
              )}
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
