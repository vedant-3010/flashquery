import { m } from 'motion/react'
import { CountUp } from '@/landing/CountUp'
import { CtaLink, TextLink } from '@/landing/CtaLink'
import { BENCH, ROWS, TRY_URL } from '@/landing/data'
import { FileDrop } from '@/landing/FileDrop'
import { HeroFilm } from '@/landing/film/HeroFilm'
import { reveal, stagger } from '@/landing/motion'
import { HeadlineLines } from '@/landing/HeadlineLines'
import { formatNumber } from '@/lib/format'

const STATS = [
  {
    value: ROWS,
    format: (v: number) => formatNumber(Math.round(v), 'en-US'),
    label: `rows generated in your browser in ${BENCH.stats[0].value} s`,
  },
  {
    value: BENCH.stats[2].value,
    format: (v: number) => `${Math.round(v)} ms`,
    label: 'p95 for a GROUP BY over a million rows',
  },
  {
    value: 0,
    format: () => '0 bytes',
    label: 'of your file sent to any server, ever',
  },
]

export function Hero() {
  return (
    <section id="top" className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-16">
      <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10">
        <m.div
          className="lg:col-span-5 lg:pt-8"
          variants={stagger}
          initial="hidden"
          animate="shown"
        >
          <m.p
            variants={reveal}
            className="flex items-center gap-3 font-mono text-[11.5px] tracking-[0.08em] text-ink-muted uppercase"
          >
            <span className="h-px w-8 bg-ink-faint" aria-hidden />A data analyst in your browser tab
          </m.p>
          <m.h1
            variants={reveal}
            className="mt-6 text-[clamp(44px,4.5vw,66px)] text-balance text-ink"
          >
            <HeadlineLines
              accent
              burst="data"
              lead="Ask your data anything."
              line="It never leaves your browser."
            />
          </m.h1>
          <m.p
            variants={reveal}
            className="mt-7 max-w-[33rem] text-[17px] leading-[1.6] text-pretty text-ink-muted"
          >
            Drop in a CSV, Excel, Parquet or JSON file and ask in plain English. flashQuery writes
            the SQL, runs it on your machine with DuckDB, and shows you every step, including
            exactly what the AI saw.
          </m.p>
          <m.div variants={reveal} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <FileDrop>
              <CtaLink href={TRY_URL}>Try it on 1M rows</CtaLink>
            </FileDrop>
            <TextLink href="#how" className="text-[15px] text-ink">
              How it works
            </TextLink>
          </m.div>
          <m.p variants={reveal} className="mt-4 text-[13px] text-ink-faint">
            No sign-up, and no API key needed for the demo.
          </m.p>
        </m.div>

        <m.div
          className="lg:col-span-7"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.25, 1, 0.5, 1] }}
        >
          <HeroFilm />
        </m.div>
      </div>

      <dl className="mt-16 grid gap-px overflow-hidden border-y border-hairline sm:grid-cols-3">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={`py-6 sm:px-6 ${i > 0 ? 'border-t border-hairline sm:border-t-0 sm:border-l' : 'sm:pl-0'}`}
          >
            <dt className="sr-only">{stat.label}</dt>
            <dd>
              <CountUp
                to={stat.value}
                format={stat.format}
                className="block font-serif text-[44px] leading-none text-ink"
              />
              <span className="mt-2 block text-[13.5px] text-ink-muted">{stat.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
