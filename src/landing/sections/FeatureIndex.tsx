import { AnimatePresence, m, useMotionValue, useSpring } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { cx } from '@/landing/cx'
import {
  DashboardVignette,
  ExploreVignette,
  JoinsVignette,
  LocalModelVignette,
  NotebookVignette,
  PaletteVignette,
} from '@/landing/features/Vignettes'
import { Reveal } from '@/landing/Reveal'
import { HeadlineLines } from '@/landing/HeadlineLines'

const PREVIEW_HEIGHT = 160

const FEATURES: { title: string; body: string; tags: string; Preview: ComponentType }[] = [
  {
    title: 'Dashboards that stay live',
    body: 'Pin answers or let the AI draft one. Drag, resize, filter every tile at once or click a bar to cross-filter, present full screen, export to HTML or PDF.',
    tags: 'Cross-filter · Present · Export',
    Preview: DashboardVignette,
  },
  {
    title: 'Python when SQL isn’t enough',
    body: 'Forecasts and regressions run as pandas in Pyodide, only after you approve the code. A notebook in the scratchpad runs your own cells, with matplotlib.',
    tags: 'pandas · matplotlib · approval',
    Preview: NotebookVignette,
  },
  {
    title: 'Your model, on your machine',
    body: 'Bring an Anthropic or OpenAI key, or point flashQuery at Ollama or LM Studio and keep everything on this computer.',
    tags: 'BYOK · Ollama · LM Studio',
    Preview: LocalModelVignette,
  },
  {
    title: 'It looks before it answers',
    body: 'Unsure how a value is spelled? The AI can run up to three small, checked queries first. Each one is in the trace.',
    tags: 'Exploration · Trace',
    Preview: ExploreVignette,
  },
  {
    title: 'Joins it finds for you',
    body: 'Load two related files and flashQuery spots the keys between them by name and by matching values, then uses them when a question spans both.',
    tags: 'Relationships · Multi-table',
    Preview: JoinsVignette,
  },
  {
    title: 'Made for the keyboard',
    body: 'Press ⌘K to jump anywhere, / to ask, ? for every shortcut. Grids copy as TSV straight into a spreadsheet.',
    tags: '⌘K · Shortcuts · TSV',
    Preview: PaletteVignette,
  },
]

/**
 * The feature index (PRD D99): a numbered list, not cards. On wide screens a preview column slides
 * to the hovered or focused row; on narrow screens each preview is inline.
 */
export function FeatureIndex() {
  const list = useRef<HTMLOListElement>(null)
  // `hovered` dims the other rows; `current` is the row the preview shows, and stays after the
  // pointer leaves (the first row until then), so the preview column is never empty.
  const [hovered, setHovered] = useState<number | null>(null)
  const [current, setCurrent] = useState(0)
  const y = useMotionValue(0)
  const springY = useSpring(y, { stiffness: 260, damping: 28, mass: 0.7 })
  const rowCenter = (index: number) => {
    const row = list.current?.children[index] as HTMLElement | undefined
    return row ? row.offsetTop + row.offsetHeight / 2 - PREVIEW_HEIGHT / 2 : 0
  }

  useLayoutEffect(() => {
    y.jump(rowCenter(0))
  }, [y])

  /** The preview column follows the active row: centred on it, on a spring. */
  const show = (index: number) => {
    setHovered(index)
    setCurrent(index)
    y.set(rowCenter(index))
  }
  const Preview = FEATURES[current]?.Preview

  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="mx-auto max-w-[1200px] px-5 pt-32 md:px-8"
    >
      <Reveal group className="max-w-[52rem]">
        <Reveal
          as="p"
          className="font-mono text-[11.5px] tracking-[0.08em] text-ink-muted uppercase"
        >
          Also in the box
        </Reveal>
        <Reveal as="div">
          <h2 id="features-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
            <HeadlineLines lead="Everything else" line="an analyst reaches for." />
          </h2>
        </Reveal>
      </Reveal>

      <ol
        ref={list}
        className="relative mt-12 border-b border-hairline"
        onPointerLeave={() => setHovered(null)}
      >
        {FEATURES.map((feature, i) => (
          <Reveal as="li" key={feature.title}>
            <div
              tabIndex={0}
              onPointerEnter={() => show(i)}
              onFocus={() => show(i)}
              onBlur={() => setHovered(null)}
              className={cx(
                'group grid gap-x-8 gap-y-2 border-t border-hairline py-6 outline-none transition-colors duration-300 md:grid-cols-[56px_minmax(0,5fr)_minmax(0,6fr)] lg:grid-cols-[56px_minmax(0,4fr)_minmax(0,5fr)_260px] focus-visible:bg-paper-deep/50',
                hovered !== null && hovered !== i ? 'text-ink-faint' : 'text-ink',
              )}
            >
              <span className="font-mono text-[12px] text-ink-faint">0{i + 1}</span>
              <h3 className="font-serif text-[28px] leading-[1.05] transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover:translate-x-1.5">
                {feature.title}
              </h3>
              <div>
                <p className="text-[15px] leading-[1.6] text-ink-muted">{feature.body}</p>
                <p className="mt-2 font-mono text-[10.5px] tracking-[0.04em] text-ink-faint">
                  {feature.tags}
                </p>
                <div className="mt-4 h-[150px] max-w-[300px] lg:hidden">
                  <feature.Preview />
                </div>
              </div>
            </div>
          </Reveal>
        ))}

        <m.div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 z-10 hidden w-[260px] lg:block"
          style={{ y: springY, height: PREVIEW_HEIGHT }}
        >
          <AnimatePresence mode="wait">
            {Preview && (
              <m.div
                key={current}
                initial={{ opacity: 0, scale: 0.96, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                className="h-full w-full shadow-[0_24px_40px_-24px_rgba(21,21,21,.45)]"
              >
                <Preview />
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      </ol>
    </section>
  )
}
