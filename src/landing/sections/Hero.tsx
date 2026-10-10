import { m } from 'motion/react'
import { CountUp } from '@/landing/CountUp'
import { CtaLink, TextLink } from '@/landing/CtaLink'
import { EYEBROW, EyebrowRule } from '@/landing/Eyebrow'
import { BENCH, REGISTER_URL, ROWS, TRY_URL } from '@/landing/data'
import { FileDrop } from '@/landing/FileDrop'
import { HeroFilm } from '@/landing/film/HeroFilm'
import { reveal, stagger } from '@/landing/motion'
import { HeadlineLines } from '@/landing/HeadlineLines'
import { formatNumber } from '@/lib/format'

// Privacy first, then speed, in plain words (D117); every figure is a real measurement (data.ts).
const STATS = [
  {
    value: 0,
    format: () => '0',
    unit: 'bytes',
    label: 'of your files uploaded, ever',
  },
  {
    value: ROWS,
    format: (v: number) => formatNumber(Math.round(v), 'en-US'),
    unit: '',
    label: `rows of sample data, ready in ${BENCH.stats[0].value} seconds`,
  },
  {
    value: BENCH.stats[2].value,
    format: (v: number) => `${Math.round(v)}`,
    unit: 'ms',
    label: 'to total up a million rows, on your own computer',
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
          <m.p variants={reveal} className={EYEBROW}>
            <EyebrowRule />
            Your private AI data analyst
          </m.p>
          <m.h1
            variants={reveal}
            className="mt-6 text-[clamp(44px,4.5vw,66px)] text-balance text-ink"
          >
            <HeadlineLines
              accent
              burst="data"
              lead="Ask your data anything."
              line="It never leaves your computer."
            />
          </m.h1>
          <m.p
            variants={reveal}
            className="mt-7 max-w-[33rem] text-[17px] leading-[1.6] text-pretty text-ink-muted"
          >
            Open a spreadsheet or export and ask in plain English: which customers owe you the most,
            where costs are rising, how this quarter compares. You get the answer, a chart and the
            working. Your files stay on your device.
          </m.p>
          <m.div variants={reveal} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <FileDrop>
              <CtaLink href={TRY_URL}>Try it free</CtaLink>
            </FileDrop>
            <CtaLink href={REGISTER_URL} variant="outline">
              Create an account
            </CtaLink>
          </m.div>
          <m.p variants={reveal} className="mt-4 text-[13px] text-ink-faint">
            The demo needs no sign-up and no AI key. Works with Excel, CSV and more.{' '}
            <TextLink href="#how" className="text-ink-muted hover:text-ink">
              How it works
            </TextLink>
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
              <span className="flex items-baseline gap-2 font-serif text-[44px] leading-none text-ink">
                <CountUp to={stat.value} format={stat.format} />
                {stat.unit && <span className="text-accent-ink">{stat.unit}</span>}
              </span>
              <span className="mt-2 block text-[13.5px] text-ink-muted">{stat.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
