import { AnimatePresence, m, useMotionValueEvent, useScroll } from 'motion/react'
import { useRef, useState, type ComponentType } from 'react'
import { cx } from '@/landing/cx'
import { AnswerVisual } from '@/landing/how/AnswerVisual'
import { AskVisual } from '@/landing/how/AskVisual'
import { CheckVisual } from '@/landing/how/CheckVisual'
import { LoadVisual } from '@/landing/how/LoadVisual'
import { Reveal } from '@/landing/Reveal'
import { HeadlineLines } from '@/landing/HeadlineLines'

const STEPS: { title: string; body: string; Visual: ComponentType }[] = [
  {
    title: 'Your file loads into this tab',
    body: 'DuckDB, a full analytical database compiled to WebAssembly, reads the file where it is. There is no upload, because there is no server to upload to.',
    Visual: LoadVisual,
  },
  {
    title: 'The AI sees the shape, not the rows',
    body: 'Table and column names, types and your notes. In Balanced mode, also a few statistics and three sample rows. Every request is in the inspector, exactly as it was sent.',
    Visual: AskVisual,
  },
  {
    title: 'Every query is checked before it runs',
    body: 'One read-only SELECT, only your tables, no file or network functions. If the AI gets it wrong, it sees the error and tries again, twice at most.',
    Visual: CheckVisual,
  },
  {
    title: 'You get the answer and its working',
    body: 'A chart chosen by clear rules, a short summary, SQL you can edit and re-run, the assumptions made, and a step-by-step trace.',
    Visual: AnswerVisual,
  },
]

function StepText({ index, active }: { index: number; active: boolean }) {
  const step = STEPS[index]
  if (!step) return null
  return (
    <div className={cx('transition-opacity duration-500', active ? 'opacity-100' : 'opacity-35')}>
      <p className="font-mono text-[11.5px] text-ink-muted">0{index + 1}</p>
      <h3 className="mt-2 font-serif text-[30px] leading-[1.05] text-ink">{step.title}</h3>
      <p className="mt-3 max-w-[28rem] text-[15.5px] leading-[1.6] text-ink-muted">{step.body}</p>
    </div>
  )
}

function Panel({ index }: { index: number }) {
  const Visual = STEPS[index]?.Visual
  return (
    <div className="relative h-[400px] overflow-hidden rounded-2xl border border-hairline bg-paper-deep/60">
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={index}
          className="absolute inset-0"
          initial={{ opacity: 0, y: 14, filter: 'blur(3px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(3px)' }}
          transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
        >
          {Visual && <Visual />}
        </m.div>
      </AnimatePresence>
    </div>
  )
}

/**
 * Four steps, told by scrolling (wide screens): the steps scroll past on the left, and a pinned
 * panel on the right shows whichever step is at the middle of the screen. Each step has its own
 * block, so this fits any screen height and nothing changes size as it plays. Narrow screens get
 * each step with its picture, one after another.
 */
export function HowItWorks() {
  const steps = useRef<HTMLOListElement>(null)
  // 0 when the list's top reaches the middle of the screen, 1 when its bottom does.
  const { scrollYProgress } = useScroll({ target: steps, offset: ['start center', 'end center'] })
  const [active, setActive] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (p) =>
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(p * STEPS.length)))),
  )

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="mx-auto max-w-[1200px] px-5 pt-28 md:px-8"
    >
      <Reveal group className="max-w-[52rem]">
        <Reveal
          as="p"
          className="font-mono text-[11.5px] tracking-[0.08em] text-ink-muted uppercase"
        >
          How it works
        </Reveal>
        <Reveal as="div">
          <h2 id="how-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
            <HeadlineLines lead="Four steps," line="and you can watch every one." />
          </h2>
        </Reveal>
      </Reveal>

      {/* Wide screens: scroll-told. The ink line fills down to the middle of the screen. */}
      <div className="mt-6 hidden grid-cols-12 gap-10 lg:grid">
        <div className="relative col-span-5 pl-6">
          <span aria-hidden className="absolute top-0 bottom-0 left-0 w-px bg-hairline">
            <m.span
              className="absolute inset-x-0 top-0 h-full origin-top bg-ink"
              style={{ scaleY: scrollYProgress }}
            />
          </span>
          <ol ref={steps}>
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex min-h-[60vh] items-center">
                <StepText index={i} active={i === active} />
              </li>
            ))}
          </ol>
        </div>
        <div className="col-span-7">
          <div className="sticky top-[calc(50vh-200px)]">
            <Panel index={active} />
          </div>
        </div>
      </div>

      {/* Narrow screens: one after another. */}
      <ol className="mt-10 grid gap-14 lg:hidden">
        {STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} className="grid gap-5">
            <StepText index={i} active />
            <div className="relative h-[380px] overflow-hidden rounded-2xl border border-hairline bg-paper-deep/60">
              <step.Visual />
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  )
}
