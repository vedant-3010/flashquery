import { CtaLink } from '@/landing/CtaLink'
import { cx } from '@/landing/cx'
import { PRICING, REGISTER_URL, storageLabel } from '@/landing/data'
import { Eyebrow } from '@/landing/Eyebrow'
import { HeadlineLines } from '@/landing/HeadlineLines'
import { Reveal } from '@/landing/Reveal'

// Pricing (F-PLAN-05, D119): a free account (3 hosted questions, or your own key without limits),
// Starter and Pro. The no-sign-up demo is the page's "Try it free", not a plan. The figures come
// from data.ts, checked against the plans table.

const PLANS = [
  {
    name: 'Free account',
    price: '$0',
    note: 'Your own files',
    points: [
      `${PRICING.freeQuestions} questions with HushGlance AI, no key needed`,
      'Unlimited with your own key: Anthropic, OpenAI, OpenRouter, or a model on your computer',
      `${storageLabel(PRICING.freeStorageGb)} of encrypted storage: your projects on any device`,
    ],
    cta: { href: REGISTER_URL, label: 'Create an account' },
    featured: false,
  },
  {
    name: 'Starter',
    price: `$${PRICING.starterMonthlyUsd}`,
    note: `a month, or $${PRICING.starterYearlyUsd} a year`,
    points: [
      `${PRICING.starterQuestions} questions a month with HushGlance AI, on any device you sign in to`,
      `Standard models: ${PRICING.standardModels.join(' and ')}`,
      `${storageLabel(PRICING.starterStorageGb)} of encrypted storage`,
    ],
    cta: { href: REGISTER_URL, label: 'Start free, upgrade any time' },
    featured: false,
  },
  {
    name: 'Pro',
    price: `$${PRICING.proMonthlyUsd}`,
    note: `a month, or $${PRICING.proYearlyUsd} a year`,
    points: [
      `${PRICING.proQuestions} questions a month with HushGlance AI, on any device you sign in to`,
      `Premium models too (${PRICING.premiumModels.join(', ')}), ${PRICING.premiumWeight} questions each`,
      `${storageLabel(PRICING.proStorageGb)} of encrypted storage`,
    ],
    cta: { href: REGISTER_URL, label: 'Start free, upgrade any time' },
    featured: true,
  },
] as const

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="mx-auto max-w-[1200px] px-5 pt-20 md:px-8 md:pt-32"
    >
      <Reveal group className="max-w-[52rem]">
        <Eyebrow>Pricing</Eyebrow>
        <Reveal as="div">
          <h2 id="pricing-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
            <HeadlineLines lead="Free to start." line="Pro when you ask a lot." />
          </h2>
        </Reveal>
        <Reveal
          as="p"
          className="mt-5 max-w-[36rem] text-[16px] leading-[1.6] text-ink-muted max-md:hidden"
        >
          On every plan your rows never go to an AI, and what you save is encrypted so only you can
          read it. Bring your own AI key and HushGlance is free for good; Starter and Pro are for
          asking without one.
        </Reveal>
      </Reveal>

      {/* Phones swipe through the plans, Pro first; wider screens show them side by side. */}
      <Reveal
        group
        as="ul"
        className="mt-10 -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0"
      >
        {PLANS.map((plan) => (
          <Reveal
            as="li"
            key={plan.name}
            className={cx(
              'flex w-[82%] shrink-0 snap-start flex-col rounded-2xl border p-6 md:w-auto',
              plan.featured && 'max-md:order-first',
              plan.featured
                ? 'border-accent/60 bg-panel shadow-[0_18px_36px_-28px_rgba(85,0,170,.45)]'
                : 'border-hairline bg-panel',
            )}
          >
            <h3 className="font-serif text-[26px] leading-[1.05] text-ink">{plan.name}</h3>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="font-serif text-[44px] leading-none text-ink">{plan.price}</span>
              <span className="text-[14px] text-ink-muted">{plan.note}</span>
            </p>
            <ul className="mt-5 grid gap-2.5 border-t border-hairline pt-4 text-[14.5px] leading-[1.5] text-ink">
              {plan.points.map((point) => (
                <li key={point} className="flex gap-2">
                  <span aria-hidden className="text-accent">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              <CtaLink href={plan.cta.href} variant={plan.featured ? 'ink' : 'outline'} size="sm">
                {plan.cta.label}
              </CtaLink>
            </div>
          </Reveal>
        ))}
      </Reveal>
      <p className="mt-5 text-[13px] text-ink-faint">
        Billed by Dodo Payments, our merchant of record: local sales tax included. Cancel any time.
      </p>
    </section>
  )
}
