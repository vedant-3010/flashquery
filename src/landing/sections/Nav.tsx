import { AnimatePresence, m, useMotionValueEvent, useScroll } from 'motion/react'
import { useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { CtaLink, TextLink } from '@/landing/CtaLink'
import { cx } from '@/landing/cx'
import { LOGIN_URL, REGISTER_URL, TRY_URL } from '@/landing/data'
import { SNAPPY } from '@/landing/motion'

const LINKS = [
  { href: '#privacy', label: 'Privacy' },
  { href: '#who', label: 'Who it’s for' },
  { href: '#features', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
]

/** In the phone menu, after the sections. */
const ACCOUNT_LINKS = [
  { href: LOGIN_URL, label: 'Sign in' },
  { href: REGISTER_URL, label: 'Create an account' },
]

/** Sticky top bar: a hairline and a paper backdrop appear once the page scrolls. */
export function Nav() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))

  return (
    <header className="sticky top-0 z-40">
      <div
        className={cx(
          'border-b transition-[background-color,border-color] duration-300',
          scrolled || open
            ? 'border-hairline bg-paper/92 backdrop-blur-[6px]'
            : 'border-transparent',
        )}
      >
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 max-w-[1200px] items-center gap-8 px-5 md:px-8"
        >
          <a
            href="#top"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <BrandMark className="size-[22px] text-ink" />
            flashQuery
          </a>
          <ul className="hidden items-center gap-6 text-[13.5px] text-ink-muted md:flex">
            {LINKS.map((link) => (
              <li key={link.href}>
                <TextLink href={link.href} className="transition-colors hover:text-ink">
                  {link.label}
                </TextLink>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-4">
            <TextLink
              href={LOGIN_URL}
              className="text-[13.5px] text-ink-muted transition-colors hover:text-ink max-sm:hidden"
            >
              Sign in
            </TextLink>
            <CtaLink href={TRY_URL} size="sm">
              Try it free
            </CtaLink>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close the menu' : 'Open the menu'}
              onClick={() => setOpen(!open)}
              className="relative grid size-8 place-items-center rounded-full md:hidden"
            >
              <m.span
                className="absolute h-px w-4 bg-ink"
                animate={open ? { rotate: 45, y: 0 } : { rotate: 0, y: -3 }}
                transition={SNAPPY}
              />
              <m.span
                className="absolute h-px w-4 bg-ink"
                animate={open ? { rotate: -45, y: 0 } : { rotate: 0, y: 3 }}
                transition={SNAPPY}
              />
            </button>
          </div>
        </nav>
        <AnimatePresence initial={false}>
          {open && (
            <m.ul
              id="mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-hidden px-5 md:hidden"
            >
              {[...LINKS, ...ACCOUNT_LINKS].map((link) => (
                <li key={link.href} className="border-t border-hairline first:border-t-0">
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block py-3 font-serif text-2xl"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </m.ul>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
