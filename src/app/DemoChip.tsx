import { Badge } from '@/components/ui/badge'
import { useAiMode } from '@/stores/aiMode'
import { useUiStore } from '@/stores/ui'

/** Demo mode (F-AI-03), without a key: its own chip, since it leads somewhere (add a key). */
export function DemoChip() {
  const demo = useAiMode() === 'demo'
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  if (!demo) return null
  return (
    <Badge asChild variant="secondary">
      <button
        type="button"
        title="Demo answers are example answers about the sample data, worked out live on your device. Add an AI key, or sign in for 3 free questions, to ask anything."
        onClick={() => openSettings(true)}
      >
        Demo<span className="max-lg:sr-only"> mode</span>
      </button>
    </Badge>
  )
}
