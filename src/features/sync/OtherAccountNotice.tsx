import { UsersRound } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

/**
 * This browser's projects belong to another account (a shared computer, D124): they stay hidden
 * until that account signs in here again.
 */
export function OtherAccountNotice() {
  return (
    <EmptyState
      icon={UsersRound}
      title="These projects belong to another account"
      className="py-16"
      description="This browser's projects are saved to someone else's account, so they stay hidden while you're signed in. Sign in as them to open them, or use a browser of your own: your projects come with you once you unlock your workspace there."
    />
  )
}
