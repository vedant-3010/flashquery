import { UsersRound } from 'lucide-react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

/**
 * This browser's projects belong to an account that isn't signed in (a shared computer, D124; or a
 * guest, D125): they stay hidden until that account signs in here again.
 */
export function OtherAccountNotice() {
  const guest = useAuthStore((state) => state.status === 'guest')
  if (guest) {
    return (
      <EmptyState
        icon={UsersRound}
        title="These projects are saved to an account"
        className="py-16"
        description="This browser's projects are saved to an account, so they stay hidden until it signs in. To use this browser without an account, sign in and choose “Sign out and clear this browser”, or use a browser of your own."
      >
        <Button asChild size="sm">
          <Link href={paths.login}>Sign in</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={paths.try}>Try it with sample data</Link>
        </Button>
      </EmptyState>
    )
  }
  return (
    <EmptyState
      icon={UsersRound}
      title="These projects belong to another account"
      className="py-16"
      description="This browser's projects are saved to someone else's account, so they stay hidden while you're signed in. Sign in as them to open them, or use a browser of your own: your projects come with you once you unlock your workspace there."
    />
  )
}
