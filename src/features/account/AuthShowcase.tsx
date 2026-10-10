import { AnswerLoop } from '@/features/account/AnswerLoop'
import { AUTH_POINTS } from '@/features/account/authPoints'

export interface Showcase {
  /** The headline's serif lead-in… */
  lead: string
  /** …and its wide line. */
  line: string
}

/**
 * The sign-in pages' right half (D115): the landing's voice, its own scene. Ink instead of the
 * landing's paper, and in place of the hero film, questions answering themselves card by card.
 * Wide screens only.
 */
export function AuthShowcase({ lead, line }: Showcase) {
  return (
    <aside
      aria-label="About flashQuery"
      className="ink-accent relative hidden min-h-dvh flex-col gap-8 overflow-hidden bg-ink px-10 py-8 text-paper lg:flex xl:px-14"
    >
      {/* Depth: a faint dot grid fading out, and a violet glow behind the headline. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(246,243,236,0.09)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] bg-[size:22px_22px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 size-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(140,82,255,0.28),transparent)]"
      />
      <div className="relative my-auto grid gap-9">
        <div className="grid gap-5">
          <p className="flex items-center gap-3 font-mono text-[11.5px] tracking-[0.08em] text-paper/55 uppercase">
            <span className="h-px w-8 bg-paper/30" aria-hidden />
            Your private AI analyst
          </p>
          {/* The landing's headline voice (its HeadlineLines), kept out of the landing's chunk. */}
          <h2 className="text-[clamp(34px,3.1vw,50px)] text-balance text-paper">
            <span className="block font-serif leading-[0.98] tracking-[-0.01em] text-accent italic">
              {lead}
            </span>
            <span className="headline-wide mt-1 block text-[0.86em] leading-[1.02]">{line}</span>
          </h2>
        </div>
        <AnswerLoop />
      </div>
      <ul className="relative flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-paper/65">
        {AUTH_POINTS.map((point) => (
          <li key={point} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            {point}
          </li>
        ))}
      </ul>
    </aside>
  )
}
