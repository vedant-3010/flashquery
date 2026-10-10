import { AnimatePresence, m, useMotionValue, useSpring } from 'motion/react'
import { useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { cx } from '@/landing/cx'
import {
  AnswerVignette,
  AskVignette,
  DashboardVignette,
  FilesVignette,
  ShareVignette,
} from '@/landing/features/Vignettes'
import { Eyebrow } from '@/landing/Eyebrow'
import { Reveal } from '@/landing/Reveal'
import { HeadlineLines } from '@/landing/HeadlineLines'

const PREVIEW_HEIGHT = 160

// From a spreadsheet to a shared dashboard, in plain words (D117). The technical features are in
// ForDataPeople.
const FEATURES: { title: string; body: string; tags: string; Preview: ComponentType }[] = [
  {
    title: 'Bring any spreadsheet',
    body: 'Excel, CSV and more, or paste cells straight from a sheet. Two related files? It works out how they connect. A million rows open in seconds.',
    tags: 'Excel · CSV · Paste · Several files',
    Preview: FilesVignette,
  },
  {
    title: 'Ask in plain English',
    body: 'Type your question, or say it. Unsure how something is spelled in your data? It checks before it answers.',
    tags: 'Typed or spoken · Checks first',
    Preview: AskVignette,
  },
  {
    title: 'Answers you can check',
    body: 'A chart picked for the question, a one-line summary, the assumptions it made and how it worked the answer out. Fix anything, and it reruns.',
    tags: 'Chart · Summary · Assumptions · Working',
    Preview: AnswerVignette,
  },
  {
    title: 'Dashboards in a click',
    body: 'Pin answers, or let the AI draft a whole dashboard. Filter every tile at once, present it full screen, or save it as a PDF.',
    tags: 'Pin · Filter · Present · PDF',
    Preview: DashboardVignette,
  },
  {
    title: 'Share results, not files',
    body: 'Invite your team or your accountant, or send a view-only link you can revoke. A dialog lists exactly what goes first; your files never do.',
    tags: 'Invite · View-only links · Revoke',
    Preview: ShareVignette,
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
      className="mx-auto max-w-[1200px] px-5 pt-24 md:px-8 md:pt-32"
    >
      <Reveal group className="max-w-[52rem]">
        <Eyebrow>All in one place</Eyebrow>
        <Reveal as="div">
          <h2 id="features-title" className="mt-4 text-[clamp(36px,4.6vw,60px)] text-balance">
            <HeadlineLines lead="From spreadsheet" line="to shared dashboard." />
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
              <span className="font-mono text-[12px] text-accent-ink">0{i + 1}</span>
              <h3 className="font-serif text-[28px] leading-[1.05] transition-transform duration-300 ease-[var(--ease-out-quart)] group-hover:translate-x-1.5">
                {feature.title}
              </h3>
              <div>
                <p className="text-[15px] leading-[1.6] text-ink-muted">{feature.body}</p>
                <p className="mt-2 font-mono text-[10.5px] tracking-[0.04em] text-ink-faint">
                  {feature.tags}
                </p>
                {/* Tablets show it inline; phones read the text alone (a shorter page). */}
                <div className="mt-4 h-[150px] max-w-[300px] max-md:hidden lg:hidden">
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
