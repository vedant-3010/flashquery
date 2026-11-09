import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

/**
 * Whether this browser's workspace saves to an account other than the one signed in (a shared
 * computer, D124), or to an account while no one is (a guest, D125): its projects stay hidden
 * until that account signs in again. The try projects are anyone's.
 */
export function useOtherAccount(): boolean {
  const status = useAuthStore((state) => state.status)
  const account = useAuthStore((state) => state.account?.id ?? null)
  const linked = useSyncStore((state) => state.linkedUser)
  if (linked === null) return false
  if (status === 'guest') return true
  return account !== null && account !== linked
}
