import { ArrowRight } from 'lucide-react'
import { Link } from 'wouter'
import { SIGN_IN_REQUIRED } from '@/app/access'
import { paths } from '@/app/paths'

/**
 * Under the sign-in forms: the way on without an account. Home while guests use the app (D125),
 * else the try link (D115).
 */
export function GuestLink() {
  return (
    <p>
      <Link
        href={SIGN_IN_REQUIRED ? paths.try : paths.home}
        className="group inline-flex items-center gap-1 hover:text-ink"
      >
        {SIGN_IN_REQUIRED
          ? 'Or try it free with sample data, no account needed'
          : 'Or continue without an account'}
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </p>
  )
}
