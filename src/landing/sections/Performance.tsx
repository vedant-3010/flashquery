import { m, useInView, useReducedMotion } from 'motion/react'
import { useRef } from 'react'
import { TextLink } from '@/landing/CtaLink'
import { BENCH, BENCH_URL } from '@/landing/data'
import { Reveal } from '@/landing/Reveal'
import { HeadlineLines } from '@/landing/HeadlineLines'

const DIGITS = '0123456789'

/** An odometer: each digit rolls into place, left to right, once in view. */
function Rolling({ text, run }: { text: string; run: boolean }) {
  return (
    <span className="tabular inline-flex" aria-label={text}>
      {[...text].map((char, i) => {
        const digit = DIGITS.indexOf(char)
        if (digit === -1) {
          return (
            <span key={i} aria-hidden>
              {char}
            </span>
          )
        }
        return (
          <span
            key={i}
            aria-hidden
            className="relative inline-block h-[1em] overflow-hidden [mask-image:linear-gradient(transparent,black_12%,black_88%,transparent)]"
          >
            <span className="invisible">0</span>
            <m.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={{ y: '0em' }}
              animate={{ y: run ? `-${digit}em` : '0em' }}
              transition={{ type: 'spring', stiffness: 90, damping: 18, delay: i * 0.08 }}
            >
              {[...DIGITS].map((d) => (
                <span key={d} className="h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </m.span>
          </span>
        )
      })}
    </span>
  )
}

function Stat({ stat, index }: { stat: (typeof BENCH.stats)[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' })
  const reduced = useReducedMotion() ?? false
  const run = inView || reduced
  const text = stat.value.toFixed(stat.digits)
  const share = stat.value === 0 ? 0 : Math.max(0.025, stat.value / stat.budget)

  return (
    <div ref={ref} className="border-t border-hairline py-7">
      <p className="flex items-baseline gap-2 font-serif text-[clamp(52px,6vw,76px)] leading-none text-ink">
        <Rolling text={text} run={run} />
        {stat.unit && <span className="text-[0.42em] text-ink-muted">{stat.unit}</span>}
      </p>
      <p className="mt-3 text-[14.5px] text-ink-soft">{stat.label}</p>
      {/* The whole track is the budget; its label sits at the end. */}
      <div className="mt-4">
        <div className="relative h-[3px] rounded-full bg-hairline">
          <m.div
            className="absolute inset-y-0 left-0 rounded-full bg-ink"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: run ? share : 0 }}
            style={{ width: '100%', originX: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.2 + index * 0.05 }}
          />
        </div>
        <p className="mt-2 text-right font-mono text-[10.5px] text-ink-faint">{stat.budgetLabel}</p>
      </div>
    </div>
  )
}

/** The benchmark numbers (PRD D79), with each one's budget. */
export function Performance() {
  return (
    <section
      id="performance"
      aria-labelledby="performance-title"
      className="mx-auto max-w-[1200px] px-5 pt-32 md:px-8"
    >
      <div className="grid gap-10 lg:grid-cols-12">
        <Reveal group className="lg:col-span-4">
          <Reveal
            as="p"
            className="font-mono text-[11.5px] tracking-[0.08em] text-ink-muted uppercase"
          >
            Performance
          </Reveal>
          <Reveal as="div">
            <h2 id="performance-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
              <HeadlineLines lead="Fast, because" line="it’s local." />
            </h2>
          </Reveal>
          <Reveal as="p" className="mt-5 max-w-[24rem] text-[16px] leading-[1.6] text-ink-muted">
            No round trip to a database server. Queries run where the data already is, in a worker,
            so the page stays smooth while they do.
          </Reveal>
          <Reveal as="p" className="mt-6 font-mono text-[11px] leading-[1.6] text-ink-faint">
            {BENCH.environment}.{' '}
            <TextLink href={BENCH_URL} className="text-ink-muted hover:text-ink">
              Run the benchmark on yours
            </TextLink>
          </Reveal>
        </Reveal>
        <div className="grid gap-x-10 sm:grid-cols-2 lg:col-span-8">
          {BENCH.stats.map((stat, i) => (
            <Stat key={stat.id} stat={stat} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
