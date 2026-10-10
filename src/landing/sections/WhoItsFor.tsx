import { TextLink } from '@/landing/CtaLink'
import { FINANCE_TRY_URL, TRY_URL } from '@/landing/data'
import { HeadlineLines } from '@/landing/HeadlineLines'
import { Eyebrow } from '@/landing/Eyebrow'
import { Reveal } from '@/landing/Reveal'

// Who it's for (D117): the people who run the business first, then data people. Each card asks the
// kind of question that role asks, and links to a sample it can try them on.

const ROLES = [
  {
    role: 'Founders and owners',
    pitch: 'Know your numbers without waiting for an analyst or next month’s report.',
    questions: [
      'How did revenue change this quarter?',
      'Which products make us the most money?',
      'Where are we spending more than last year?',
    ],
    link: { href: TRY_URL, label: 'Try it on sample sales' },
  },
  {
    role: 'Finance and accounting',
    pitch: 'Answers from exports and ledgers in seconds, with the working shown so you can check.',
    questions: [
      'Which customers owe us the most?',
      'How old are our unpaid invoices?',
      'What is our gross margin by quarter?',
    ],
    link: { href: FINANCE_TRY_URL, label: 'Try it on sample finances' },
  },
  {
    role: 'Sales and operations',
    pitch: 'See what’s growing, what’s slipping and why, from the spreadsheets you already have.',
    questions: [
      'Which region grew fastest?',
      'Who are our top 10 customers this year?',
      'Which channel brings the most orders?',
    ],
    link: { href: TRY_URL, label: 'Try it on sample sales' },
  },
  {
    role: 'Data analysts',
    pitch: 'Plain-English questions in, checked SQL out, and Python when SQL isn’t enough.',
    questions: [
      'Rank customers by lifetime value',
      'Forecast revenue for the next 3 months',
      'Find the outliers in daily sales',
    ],
    link: { href: '#data-people', label: 'What’s under the hood' },
  },
]

export function WhoItsFor() {
  return (
    <section
      id="who"
      aria-labelledby="who-title"
      className="mx-auto max-w-[1200px] px-5 pt-24 md:px-8 md:pt-32"
    >
      <Reveal group className="max-w-[52rem]">
        <Eyebrow>Who it’s for</Eyebrow>
        <Reveal as="div">
          <h2 id="who-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
            <HeadlineLines lead="For the people" line="who run the business." />
          </h2>
        </Reveal>
        <Reveal as="p" className="mt-5 max-w-[34rem] text-[16px] leading-[1.6] text-ink-muted">
          No formulas, no pivot tables, no waiting on someone else. Ask the way you would ask a
          colleague.
        </Reveal>
      </Reveal>

      {/* Phones swipe through the roles; wider screens show them side by side. */}
      <Reveal
        group
        as="ul"
        className="mt-10 -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4"
      >
        {ROLES.map(({ role, pitch, questions, link }) => (
          <Reveal
            as="li"
            key={role}
            className="flex w-[82%] shrink-0 snap-start flex-col rounded-2xl border border-hairline bg-panel p-6 transition-[border-color,translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-[0_18px_36px_-28px_rgba(85,0,170,.45)] sm:w-auto"
          >
            <h3 className="font-serif text-[26px] leading-[1.05] text-ink">{role}</h3>
            <p className="mt-3 text-[14.5px] leading-[1.55] text-ink-muted">{pitch}</p>
            <ul className="mt-5 grid gap-2 border-t border-hairline pt-4 text-[14px] text-ink">
              {questions.map((question) => (
                <li key={question} className="flex gap-2">
                  <span aria-hidden className="text-accent">
                    “
                  </span>
                  {question}
                </li>
              ))}
            </ul>
            <TextLink
              href={link.href}
              className="mt-auto pt-5 text-[14px] font-medium text-accent-ink"
            >
              {link.label} →
            </TextLink>
          </Reveal>
        ))}
      </Reveal>
    </section>
  )
}
