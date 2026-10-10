import { AnimatePresence, m } from 'motion/react'
import { useId, useState } from 'react'
import { Reveal } from '@/landing/Reveal'
import { SNAPPY } from '@/landing/motion'
import { HeadlineLines } from '@/landing/HeadlineLines'

const QUESTIONS = [
  {
    q: 'Is my file uploaded anywhere?',
    a: 'No. No server ever sees your files: DuckDB reads them inside your browser tab, and they stay there. Only what your privacy mode allows (names and types, plus a few statistics and sample rows in Balanced mode) goes to the AI provider you choose.',
  },
  {
    q: 'What happens when I share a dashboard?',
    a: 'Sharing uploads only the dashboard results you choose to share: each tile’s title, SQL, chart and last result (at most 5,000 rows), after a dialog lists exactly what will go. Your files never upload. The people you invite, or anyone with a view-only link you can revoke, see those results without your data or a key.',
  },
  {
    q: 'Do I need an API key?',
    a: 'Not to try it. Without a key, demo mode answers a set of questions about a generated 1,000,000-row sales dataset, and the SQL still runs live. With an Anthropic or OpenAI key, you can ask anything about your own files.',
  },
  {
    q: 'Where does my API key go?',
    a: 'Straight from your browser to the provider. It stays in memory unless you tick “Remember on this device”, and it never appears in exports, logs or the inspector.',
  },
  {
    q: 'Can I keep everything on my computer?',
    a: 'Yes. Point flashQuery at a local OpenAI-compatible server such as Ollama or LM Studio. The page’s security policy only allows the two AI providers, two CDNs and servers on localhost.',
  },
  {
    q: 'How accurate is it?',
    a: 'Every answer shows its SQL, assumptions and trace, so you can check it. Accuracy is measured with 53 questions over two datasets, comparing results rather than SQL text; the published number is coming soon.',
  },
  {
    q: 'What files can it read, and how big?',
    a: 'CSV, TSV, Excel, Parquet and JSON, or cells pasted from a spreadsheet. A million rows is comfortable; the limit is your browser’s memory.',
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
          className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline-strong text-ink transition-colors group-hover:border-ink"
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
      className="mx-auto max-w-[1200px] px-5 pt-32 md:px-8"
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
