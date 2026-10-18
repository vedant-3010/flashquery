import { useAuthStore, type AuthStatus } from '@/stores/auth'
import { usePlanStore } from '@/stores/plan'
import { activeApiKey, useSettingsStore, type AiSource } from '@/stores/settings'

// Who answers questions (F-PLAN-01): HushGlance AI (hosted) for a signed-in user who chose it, where
// this deployment offers it; else the user's own key (or local server); else the demo (F-AI-03).

export type AiMode = 'hosted' | 'own' | 'demo'

type ModeSettings = Parameters<typeof activeApiKey>[0] & { aiSource: AiSource }

/**
 * `hostedOffered`: false once the plan store found no hosted models (not deployed, offline). Until
 * it knows, a signed-in user who chose hosted AI sees it; asking waits for the answer.
 */
export function aiModeOf(
  settings: ModeSettings,
  status: AuthStatus,
  hostedOffered: boolean,
): AiMode {
  if (status === 'signed-in' && settings.aiSource === 'hosted' && hostedOffered) return 'hosted'
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
