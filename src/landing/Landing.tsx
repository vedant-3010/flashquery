import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { BuiltOn } from '@/landing/sections/BuiltOn'
import { Faq } from '@/landing/sections/Faq'
import { FeatureIndex } from '@/landing/sections/FeatureIndex'
import { FinalCta } from '@/landing/sections/FinalCta'
import { Footer } from '@/landing/sections/Footer'
import { Hero } from '@/landing/sections/Hero'
import { HowItWorks } from '@/landing/sections/HowItWorks'
import { Nav } from '@/landing/sections/Nav'
import { Performance } from '@/landing/sections/Performance'
import { PrivacyToggle } from '@/landing/sections/PrivacyToggle'

/** The landing page at / (PRD D99); the app lives at /app/. */
export function Landing() {
  // A link to a section (/#privacy) arrives before React has drawn it: scroll there once it has.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax} strict>
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main">
          <Hero />
          <BuiltOn />
          <HowItWorks />
          <PrivacyToggle />
          <Performance />
          <FeatureIndex />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </LazyMotion>
    </MotionConfig>
  )
}
