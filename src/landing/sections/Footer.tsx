import { BrandMark } from '@/components/BrandMark'
import { TextLink } from '@/landing/CtaLink'
import { APP_URL, BENCH_URL } from '@/landing/data'

export function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-5 py-12 md:grid-cols-12 md:px-8">
        <div className="md:col-span-6">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <BrandMark className="size-5 text-ink" /> flashQuery
          </p>
          <p className="mt-3 max-w-[26rem] text-[14px] text-ink-muted">
            A private AI data analyst that runs in your browser tab. Made by Vedant Dandge.
          </p>
        </div>
        <ul className="grid gap-2 text-[14px] text-ink-muted md:col-span-3">
          <li>
            <TextLink href={APP_URL} className="hover:text-ink">
              Open the app
            </TextLink>
          </li>
          <li>
            <TextLink href={BENCH_URL} className="hover:text-ink">
              Benchmark
            </TextLink>
          </li>
        </ul>
        <p className="font-mono text-[11px] leading-[1.7] text-ink-faint md:col-span-3">
          No cookies. No analytics. This page makes no requests to anyone else.
        </p>
      </div>
    </footer>
  )
}
