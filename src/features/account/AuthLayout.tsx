import type { CSSProperties, ReactNode } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { Toaster } from '@/components/Toaster'
import { AuthShowcase, type Showcase } from '@/features/account/AuthShowcase'

const SIGN_IN: Showcase = { lead: 'Welcome back.', line: 'Your data never left.' }

/**
 * The sign-in pages (F-ACCT-01, D115): the form on the landing's paper, left, and an ink showcase,
 * right. The form rises in; with reduced motion everything holds still. On narrow screens the form
 * stands alone under the brand.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
  showcase = SIGN_IN,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  showcase?: Showcase
}) {
  // The form rises in, part by part (.auth-rise in index.css; still with reduced motion).
  const rise = (step: number) => ({ '--rise': step }) as CSSProperties
  return (
    <>
      <div className="paper-scope grid min-h-dvh lg:grid-cols-2">
        <main className="flex min-h-dvh flex-col">
          {/* The brand, top left, on every page size (the landing page is another page, not a route). */}
          <header className="flex h-14 shrink-0 items-center px-6 lg:h-[76px] lg:px-10 xl:px-14">
            <a
              href="/"
              className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
            >
              <BrandMark className="size-[18px] text-ink lg:size-[20px]" />
              flashQuery
            </a>
          </header>
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <div className="grid w-full max-w-[24rem] gap-7">
              <div className="auth-rise grid gap-2.5" style={rise(0)}>
                <h1 className="font-serif text-[44px] leading-[0.95] tracking-[-0.01em] text-ink italic">
                  {title}
                </h1>
                {description && (
                  <p className="text-[15px] leading-relaxed text-pretty text-ink-muted">
                    {description}
                  </p>
                )}
              </div>
              <div className="auth-rise grid gap-4" style={rise(1)}>
                {children}
              </div>
              {footer && (
                <div className="auth-rise grid gap-1.5 text-sm text-ink-muted" style={rise(2)}>
                  {footer}
                </div>
              )}
            </div>
          </div>
        </main>
        <AuthShowcase {...showcase} />
      </div>
      <Toaster />
    </>
  )
}
