import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'
import { cx } from '@/landing/cx'
import { columnFields, PAYLOAD_BALANCED } from '@/landing/data'
import { SNAPPY } from '@/landing/motion'
import { Reveal } from '@/landing/Reveal'
import { HeadlineLines } from '@/landing/HeadlineLines'

type Mode = 'strict' | 'balanced'

const MODES: { id: Mode; label: string; summary: string }[] = [
  {
    id: 'strict',
    label: 'Strict',
    summary: 'Names, types, row counts and your notes. No values from your data, and no results.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    summary:
      'Strict, plus per-column statistics, up to 5 common values and 3 sample rows, with text cut to 40 characters.',
  },
]

const FIELDS = columnFields()
const collapse = {
  initial: { opacity: 0, width: 0 },
  animate: { opacity: 1, width: 'auto' },
  exit: { opacity: 0, width: 0 },
  transition: { duration: 0.35, ease: [0.25, 1, 0.5, 1] as const },
}

function Payload({ mode }: { mode: Mode }) {
  const balanced = mode === 'balanced'
  const line = 'block whitespace-pre'
  return (
    <div className="overflow-x-auto p-4 font-mono text-[11.5px] leading-[1.75] text-ink-soft">
      <span className={`${line} text-ink-faint`}>{'<data>'}</span>
      <span className={line}>{'{ "name": "orders", "rows": 1000000,'}</span>
      <span className={line}>{'  "notes": "Fiscal year starts in April.",'}</span>
      <span className={line}>{'  "columns": ['}</span>
      {FIELDS.map((fields, row) => {
        // Commas trail each field (so lines break after them); the last one shown has none.
        const lastShown = fields.filter((f) => f.strict || balanced).at(-1)?.key
        return (
          <m.span key={row} layout="position" className="flex flex-wrap pl-[4ch]">
            <span className="whitespace-pre">{'{ '}</span>
            {fields.map((field) => (
              <AnimatePresence key={field.key} initial={false}>
                {(field.strict || balanced) && (
                  <m.span
                    {...collapse}
                    className={cx(
                      'inline-block overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere]',
                      !field.strict && 'text-accent-ink',
                    )}
                  >
                    &quot;{field.key}&quot;: {field.value}
                    {field.key === lastShown ? '' : ', '}
                  </m.span>
                )}
              </AnimatePresence>
            ))}
            <span className="whitespace-pre">
              {' }'}
              {row < FIELDS.length - 1 ? ',' : ''}
            </span>
          </m.span>
        )
      })}
      <m.span layout="position" className={line}>
        {'  ]'}
        {balanced ? ',' : ''}
      </m.span>
      <AnimatePresence initial={false}>
        {balanced && (
          <m.span
            key="samples"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            className="block overflow-hidden text-accent-ink"
          >
            <span className={line}>{'  "sampleRows": ['}</span>
            {PAYLOAD_BALANCED.sampleRows.map((r, i) => (
              <span key={i} className={line}>
                {`    ${JSON.stringify(r)}${i < PAYLOAD_BALANCED.sampleRows.length - 1 ? ',' : ''}`}
              </span>
            ))}
            <span className={line}>{'  ]'}</span>
          </m.span>
        )}
      </AnimatePresence>
      <m.span layout="position" className={line}>
        {'}'}
      </m.span>
      <m.span layout="position" className={`${line} text-ink-faint`}>
        {'</data>'}
      </m.span>
    </div>
  )
}

/**
 * The privacy modes, made concrete (PRD D99): the request's table line as the app builds it,
 * switching between Strict and Balanced. Values from the data are in the accent colour.
 */
export function PrivacyToggle() {
  const [mode, setMode] = useState<Mode>('balanced')
  const index = MODES.findIndex((m2) => m2.id === mode)

  return (
    <section
      id="privacy"
      aria-labelledby="privacy-title"
      className="mx-auto max-w-[1200px] px-5 pt-32 md:px-8"
    >
      <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-10">
        <Reveal group className="min-w-0 lg:col-span-5">
          <Reveal
            as="p"
            className="font-mono text-[11.5px] tracking-[0.08em] text-ink-muted uppercase"
          >
            Privacy you can read
          </Reveal>
          <Reveal as="div">
            <h2 id="privacy-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
              <HeadlineLines lead="You decide" line="what the AI sees." />
            </h2>
          </Reveal>
          <Reveal as="p" className="mt-5 max-w-[30rem] text-[16px] leading-[1.6] text-ink-muted">
            Your file stays in the tab either way. The mode only decides how much of its shape goes
            with your question. This is the real format, and the app's inspector shows every request
            exactly like this.
          </Reveal>

          <Reveal as="div" className="mt-8">
            <div
              role="radiogroup"
              aria-label="Privacy mode"
              className="relative grid w-[280px] grid-cols-2 rounded-full border border-hairline-strong bg-paper p-1"
            >
              <m.span
                aria-hidden
                className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-ink"
                animate={{ x: index === 0 ? '0%' : '100%' }}
                transition={SNAPPY}
              />
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === item.id}
                  onClick={() => setMode(item.id)}
                  className={cx(
                    'relative z-10 h-9 rounded-full text-[14px] font-medium transition-colors duration-200',
                    mode === item.id ? 'text-paper' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <m.p
                key={mode}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="mt-4 max-w-[28rem] text-[14px] leading-[1.55] text-ink-soft"
              >
                {MODES[index]?.summary}
              </m.p>
            </AnimatePresence>
            <p className="mt-6 max-w-[28rem] border-t border-hairline pt-4 text-[13.5px] text-ink-muted">
              No API key? Demo mode sends nothing at all. Prefer a model on your own machine? Point
              flashQuery at Ollama or LM Studio.
            </p>
          </Reveal>
        </Reveal>

        <Reveal className="min-w-0 lg:col-span-7">
          <div className="overflow-hidden rounded-[14px] border border-hairline-strong bg-panel shadow-[0_24px_48px_-32px_rgba(21,21,21,.35)]">
            <p className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 font-mono text-[11px] text-ink-muted">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden />
              What the AI saw · {mode === 'strict' ? 'Strict' : 'Balanced'}
              <span className="ml-auto text-ink-faint">part of the request</span>
            </p>
            <Payload mode={mode} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
