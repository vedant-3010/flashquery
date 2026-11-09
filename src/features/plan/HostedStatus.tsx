import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import { meterVisible, remainingLabel } from '@/lib/plans'
import { usePlanStore } from '@/stores/plan'

/**
 * Under the ask box with HushGlance AI (F-PLAN-02): what's left of the questions (always for a
 * guest and on free, on a paid plan only when it runs low) and the way on: plans, or for a guest
 * (D125) an account.
 */
export function HostedStatus() {
  const quota = usePlanStore((state) => state.quota)
  const guest = usePlanStore((state) => state.audience === 'guest')
  const openUpgrade = usePlanStore((state) => state.openUpgrade)
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span>{guest ? 'HushGlance AI, no account.' : 'HushGlance AI.'}</span>
      {quota && meterVisible(quota) && (
        <span className="font-medium text-foreground" aria-label="Hosted questions left">
          {remainingLabel(quota)}.
        </span>
      )}
      {guest ? (
        <Button asChild size="xs" variant="link" className="h-auto px-0">
          <Link href={paths.register}>Create a free account for more</Link>
        </Button>
      ) : quota?.plan === 'free' ? (
        <Button
          size="xs"
          variant="link"
          className="h-auto px-0"
          onClick={() => openUpgrade('chosen')}
        >
          See plans
        </Button>
      ) : (
        <span>Only what your privacy mode allows is sent. Results stay here.</span>
      )}
    </span>
  )
}
