import { useSyncStore } from '@/stores/sync'

/** Whether this browser's projects save to an account (so "Keep on this device only" applies). */
export function useSyncLinked(): boolean {
  return useSyncStore((state) => state.linked && state.status !== 'other-account')
}
