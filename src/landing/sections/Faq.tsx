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
    a: 'No. No server ever sees your files: flashQuery reads them inside your browser, and they stay on your device. To answer, the AI gets an outline of your data (column names, and a few samples only if you allow it), and you can read every request.',
  },
  {
    q: 'Do I need to know SQL or formulas?',
    a: 'No. Ask the way you would ask a colleague: “which customers owe us the most?” flashQuery works out the query, the chart and a short summary. The query is there to read or change if you want it.',
  },
  {
    q: 'What files can I use?',
    a: 'Excel, CSV and more (TSV, Parquet, JSON), or cells pasted straight from a spreadsheet. Exports from your accounting, sales or banking tools work well. A million rows is comfortable; the limit is your computer’s memory.',
  },
  {
    q: 'Is it free? Do I need an AI key?',
    a: 'Trying it is free, with no sign-up: demo mode answers example questions about sample sales and finance data. To ask about your own files, add a key from Anthropic or OpenAI (you pay them for what you use), or use an AI model on your own computer.',
  },
  {
    q: 'Can I share with my team or my accountant?',
    a: 'Yes. Invite people by email, as viewers or editors, or send a view-only link that you can revoke at any time. They see the dashboard’s results without your files or a key.',
  },
  {
    q: 'What exactly happens when I share?',
    a: 'Sharing uploads only the dashboard results you choose to share: each tile’s title, chart and last result (at most 5,000 rows), after a dialog lists exactly what will go. Your files never upload.',
  },
  {
    q: 'How accurate is it?',
    a: 'On our test set of 53 questions over two datasets, even a small, low-cost AI model answers about 94% correctly. Every answer shows its working (the assumptions made and the query), so you can check it, and correct it if needed.',
  },
  {
    q: 'Can I keep everything on my computer?',
    a: 'Yes. Point flashQuery at an AI model running on your own computer (through Ollama or LM Studio), and not even the outline of your data leaves it.',
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
      className="mx-auto max-w-[1200px] px-5 pt-24 md:px-8 md:pt-32"
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
