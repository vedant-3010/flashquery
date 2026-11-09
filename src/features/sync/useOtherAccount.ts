import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

/**
 * Whether this browser's workspace saves to another account than the one signed in (a shared
 * computer, D124): its projects stay hidden until that account signs in again.
 */
export function useOtherAccount(): boolean {
  const account = useAuthStore((state) => state.account?.id ?? null)
  const linked = useSyncStore((state) => state.linkedUser)
  return account !== null && linked !== null && account !== linked
}
