import { BrandMark } from '@/components/BrandMark'
import { TextLink } from '@/landing/CtaLink'
import { BENCH_URL, LOGIN_URL, REGISTER_URL, TRY_URL } from '@/landing/data'

const LINKS = [
  { href: TRY_URL, label: 'Try it free' },
  { href: LOGIN_URL, label: 'Sign in' },
  { href: REGISTER_URL, label: 'Create an account' },
  { href: BENCH_URL, label: 'Benchmark' },
]

export function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-12 md:grid-cols-12 md:px-8">
        <div className="md:col-span-6">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <BrandMark className="size-5 text-ink" /> flashQuery
          </p>
          <p className="mt-3 max-w-[26rem] text-[14px] text-ink-muted">
            A private AI analyst for your business data: answers, charts and dashboards, with your
            files kept on your device. Made by Vedant Dandge.
          </p>
        </div>
        <ul className="grid content-start gap-2 text-[14px] text-ink-muted md:col-span-3">
          {LINKS.map((link) => (
            <li key={link.href}>
              <TextLink href={link.href} className="hover:text-ink">
                {link.label}
              </TextLink>
            </li>
          ))}
        </ul>
        <p className="font-mono text-[11px] leading-[1.7] text-ink-faint md:col-span-3">
          No cookies. No analytics. This page makes no requests to anyone else.
        </p>
      </div>
    </footer>
  )
}
