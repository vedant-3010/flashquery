import { useAuthStore, type AuthStatus } from '@/stores/auth'
import { usePlanStore } from '@/stores/plan'
import { activeApiKey, useSettingsStore, type AiSource } from '@/stores/settings'

// Who answers questions (F-PLAN-01): HushGlance AI (hosted) for a signed-in user who chose it, or
// a guest who turned it on (D125), where this deployment offers it; else the user's own key (or
// local server); else the demo (F-AI-03).

export type AiMode = 'hosted' | 'own' | 'demo'

type ModeSettings = Parameters<typeof activeApiKey>[0] & { aiSource: AiSource; guestAi: boolean }

/** Whether HushGlance AI is this person's to use: signed in, or a guest who turned it on. */
export function hostedEligible(status: AuthStatus, guestAi: boolean): boolean {
  return status === 'signed-in' || (status === 'guest' && guestAi)
}

/**
 * `hostedOffered`: false once the plan store found no hosted models (not deployed, offline). Until
 * it knows, someone who chose hosted AI sees it; asking waits for the answer.
 */
export function aiModeOf(
  settings: ModeSettings,
  status: AuthStatus,
  hostedOffered: boolean,
): AiMode {
  if (hostedEligible(status, settings.guestAi) && settings.aiSource === 'hosted' && hostedOffered) {
    return 'hosted'
  }
  return activeApiKey(settings) ? 'own' : 'demo'
}

export function currentAiMode(): AiMode {
  return aiModeOf(
    useSettingsStore.getState(),
    useAuthStore.getState().status,
    usePlanStore.getState().catalogStatus !== 'unavailable',
  )
}

/** The current AI mode, for components (a string: safe as a Zustand selector result). */
export function useAiMode(): AiMode {
  const status = useAuthStore((state) => state.status)
  const offered = usePlanStore((state) => state.catalogStatus !== 'unavailable')
  return useSettingsStore((state) => aiModeOf(state, status, offered))
}

/** Whether HushGlance AI shows as a choice here (eligible, and not found missing). */
export function useHostedOffered(): boolean {
  const status = useAuthStore((state) => state.status)
  const guestAi = useSettingsStore((state) => state.guestAi)
  const missing = usePlanStore((state) => state.catalogStatus === 'unavailable')
  return hostedEligible(status, guestAi) && !missing
}

/** A guest who could turn HushGlance AI on (accounts are set up here; not signed in, not yet on). */
export function useGuestAiOffer(): boolean {
  const guest = useAuthStore((state) => state.status === 'guest')
  const guestAi = useSettingsStore((state) => state.guestAi)
  return guest && !guestAi
}
