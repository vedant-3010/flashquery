import { CtaLink } from '@/landing/CtaLink'
import { REGISTER_URL, TRY_URL } from '@/landing/data'
import { FileDrop } from '@/landing/FileDrop'
import { HeadlineLines } from '@/landing/HeadlineLines'

/** The closing line; a few files glide onto the button, the way you'd drop them into the app. */
export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-28 pb-24 md:px-8 md:pt-36 md:pb-28">
      <div className="grid justify-items-start gap-8 border-t border-ink pt-14">
        <h2 className="text-[clamp(44px,7vw,100px)] text-balance">
          <HeadlineLines
            accent
            lead="Your data stays put."
            line="Your answers don’t have to wait."
          />
        </h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FileDrop>
            <CtaLink href={TRY_URL}>Try it free</CtaLink>
          </FileDrop>
          <CtaLink href={REGISTER_URL} variant="outline">
            Create an account
          </CtaLink>
        </div>
        <p className="text-[13px] text-ink-faint">No sign-up needed for the demo.</p>
      </div>
    </section>
  )
}
