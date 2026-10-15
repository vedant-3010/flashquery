import { AnimatePresence, m } from 'motion/react'
import { useId, useState } from 'react'
import { cx } from '@/landing/cx'
import { Reveal } from '@/landing/Reveal'
import { SNAPPY } from '@/landing/motion'
import { HeadlineLines } from '@/landing/HeadlineLines'

// Business readers' questions first (D117); the accuracy figure is the eval average (PRD D112).
const QUESTIONS = [
  {
    q: 'Is my file uploaded anywhere?',
    a: 'No. No server ever sees your files: HushGlance reads them inside your browser, and they stay on your device. To answer, the AI gets an outline of your data: column names and types by default, a few sample values only if you switch on Balanced. You can read every request.',
  },
  {
    q: 'Do I need to know SQL or formulas?',
    a: 'No. Ask the way you would ask a colleague: “which customers owe us the most?” HushGlance works out the query, the chart and a short summary. The query is there to read or change if you want it.',
  },
  {
    q: 'What files can I use?',
    a: 'Excel, CSV and more (TSV, Parquet, JSON), or cells pasted straight from a spreadsheet. Exports from your accounting, sales or banking tools work well. A million rows is comfortable; the limit is your computer’s memory.',
  },
  {
    q: 'Is it free? Do I need an AI key?',
    a: 'Trying it is free, with no sign-up: demo mode answers example questions about sample sales and finance data. A free account gets 3 questions with HushGlance AI, no key needed; Starter gives you 100 a month and Pro 300. Or bring your own key from Anthropic, OpenAI or OpenRouter (you pay them for what you use), or use an AI model on your own computer (Ollama, LM Studio), and nothing at all leaves it: free, with no limit.',
  },
  {
    q: 'What does HushGlance’s own AI see?',
    a: 'Only what your privacy mode allows. In Strict mode, the default: your question and your tables’ and columns’ names and types, never a value. If you switch on Balanced, also a few sample values. It passes through our server and OpenRouter to the model, and every request requires zero data retention: no one keeps it, and we don’t log it. Your files never leave your device.',
  },
  {
    q: 'What do you keep about me?',
    a: 'Your account (email and name), your plan (from Dodo Payments; we never see your card), how many HushGlance AI questions you’ve asked but never what you asked, and the dashboards you choose to share, until you delete them. Your files, your questions and their answers stay in your browser.',
  },
  {
    q: 'Can I share with my team or my accountant?',
    a: 'Yes. Invite people by email, as viewers or editors, or send a view-only link you can revoke at any time. Sharing uploads only the dashboard results you choose (each tile’s title, chart and last result, at most 5,000 rows), after a dialog lists exactly what will go. Your files never upload.',
  },
  {
    q: 'How accurate is it?',
    a: 'On our test set of 53 questions over two datasets, even a small, low-cost AI model answers about 94% correctly in Balanced mode. Strict mode sends no values, so questions about an exact name or code are harder for it. Every answer shows its working (the assumptions made and the query), so you can check it, and correct it if needed.',
  },
]

function Item({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="border-t border-hairline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="group flex w-full items-center gap-6 py-5 text-left"
      >
        <span className="flex-1 font-serif text-[24px] leading-tight text-ink">{q}</span>
        <m.span
          aria-hidden
          animate={{ rotate: open ? 45 : 0 }}
          transition={SNAPPY}
          className={cx(
            'grid size-8 shrink-0 place-items-center rounded-full border transition-colors group-hover:border-accent group-hover:text-accent-ink',
            open
              ? 'border-accent bg-accent text-paper group-hover:text-paper'
              : 'border-hairline-strong text-ink',
          )}
        >
          <svg viewBox="0 0 12 12" className="size-3">
            <path
              d="M6 1.5v9M1.5 6h9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-[44rem] pb-6 text-[15.5px] leading-[1.65] text-ink-muted">{a}</p>
          </m.div>
        )}
      </AnimatePresence>
    </li>
  )
}

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="mx-auto max-w-[1200px] px-5 pt-20 md:px-8 md:pt-32"
    >
      <div className="grid gap-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <h2 id="faq-title" className="text-[clamp(36px,4.6vw,60px)] text-balance">
            <HeadlineLines lead="Questions," line="answered." />
          </h2>
        </Reveal>
        <Reveal className="lg:col-span-8">
          <ul className="border-b border-hairline">
            {QUESTIONS.map((item) => (
              <Item key={item.q} {...item} />
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
