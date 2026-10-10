import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { BrandMark } from '@/components/BrandMark'
import { Toaster } from '@/components/Toaster'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'

/** A signed-in account page (F-ACCT-03): the brand, one centered card, a way back. */
export function CenteredLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const theme = useResolvedTheme()
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <Link href={paths.home} className="flex items-center gap-1.5 font-semibold">
          <BrandMark className="size-[18px] text-primary" onDark={theme === 'dark'} />
          flashQuery
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
        <div className="grid w-full max-w-sm gap-6">
          <div className="grid gap-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          <div className="grid gap-4 rounded-xl border bg-card p-5">{children}</div>
          {footer && (
            <div className="grid gap-1 text-center text-sm text-muted-foreground">{footer}</div>
          )}
        </div>
      </main>
      <Toaster />
    </div>
  )
}
