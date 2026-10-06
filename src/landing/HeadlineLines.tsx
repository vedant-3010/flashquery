import { cx } from '@/landing/cx'
import { PixelBurst } from '@/landing/PixelBurst'

/**
 * The page's headline voice (D99): an italic serif lead-in, then the point in a wide grotesque,
 * each on its own line. Goes inside an h1/h2, which sets the size; the wide line is a little
 * smaller, since the serif's small x-height makes it look smaller at the same size.
 */
export function HeadlineLines({
  lead,
  line,
  accent = false,
  burst,
}: {
  lead: string
  line: string
  /** The lead-in in the accent colour (the hero and the closing line). */
  accent?: boolean
  /**
   * A word of the lead-in to mark with a pixel burst (the hero). The line ends after it, so the
   * burst has room above and to the right, clear of the next word.
   */
  burst?: string
}) {
  const at = burst ? lead.indexOf(burst) : -1
  return (
    <>
      <span
        className={cx(
          'block font-serif leading-[0.98] tracking-[-0.01em] italic',
          accent && 'text-accent',
        )}
      >
        {burst && at !== -1 ? (
          <>
            {lead.slice(0, at)}
            <span className="relative">
              {burst}
              <PixelBurst />
            </span>{' '}
            {/* A block, not a <br>, so it is still read as one sentence. */}
            <span className="block">{lead.slice(at + burst.length).trim()}</span>
          </>
        ) : (
          lead
        )}
      </span>{' '}
      <span className="headline-wide block text-[0.8em] leading-[1.06]">{line}</span>
    </>
  )
}
