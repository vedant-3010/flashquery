import { Button } from '@/components/ui/button'
import { meterVisible, remainingLabel } from '@/lib/plans'
import { usePlanStore } from '@/stores/plan'

/**
 * Under the ask box with HushGlance AI (F-PLAN-02): what's left of the questions (always on free,
 * on a paid plan only when it runs low) and the way to the plans.
 */
export function HostedStatus() {
  const quota = usePlanStore((state) => state.quota)
  const openUpgrade = usePlanStore((state) => state.openUpgrade)
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span>HushGlance AI.</span>
      {quota && meterVisible(quota) && (
        <span className="font-medium text-foreground" aria-label="Hosted questions left">
          {remainingLabel(quota)}.
        </span>
      )}
      {quota?.plan === 'free' ? (
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
