import { CtaLink } from '@/landing/CtaLink'
import { TRY_URL } from '@/landing/data'
import { FileDrop } from '@/landing/FileDrop'
import { HeadlineLines } from '@/landing/HeadlineLines'

/** The closing line; a few files glide onto the button, the way you'd drop them into the app. */
export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-36 pb-28 md:px-8">
      <div className="grid justify-items-start gap-8 border-t border-ink pt-14">
        <h2 className="text-[clamp(48px,7vw,100px)] text-balance">
          <HeadlineLines accent lead="Your data stays put." line="Your questions don’t have to." />
        </h2>
        <FileDrop>
          <CtaLink href={TRY_URL}>Open flashQuery</CtaLink>
        </FileDrop>
      </div>
    </section>
  )
}
