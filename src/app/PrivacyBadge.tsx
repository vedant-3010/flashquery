import { ShieldCheck } from 'lucide-react'
import type { PrivacyMode } from '@/ai/schemas'
import { Badge } from '@/components/ui/badge'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const LABELS: Record<PrivacyMode, string> = { strict: 'Strict', balanced: 'Balanced' }

/** Privacy mode (F-AI-02) and, without a key, demo mode (F-AI-03); both open Settings. */
export function PrivacyBadge() {
  const mode = useSettingsStore((state) => state.privacyMode)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)
  const openSettings = useUiStore((state) => state.setSettingsOpen)

  return (
    <>
      {demo && (
        <Badge asChild variant="secondary">
          <button
            type="button"
            title="Demo answers are pre-recorded; SQL runs live on your device. Add an API key to ask anything."
            onClick={() => openSettings(true)}
          >
            Demo
          </button>
        </Badge>
      )}
      <Badge asChild variant="outline">
        <button type="button" onClick={() => openSettings(true)}>
          <ShieldCheck aria-hidden />
          <span className="sr-only">Privacy mode: </span>
          {LABELS[mode]}
        </button>
      </Badge>
    </>
  )
}
