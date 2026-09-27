import { ShieldCheck } from 'lucide-react'
import type { PrivacyMode } from '@/ai/schemas'
import { Badge } from '@/components/ui/badge'
import { useSettingsStore } from '@/stores/settings'

const LABELS: Record<PrivacyMode, string> = { strict: 'Strict', balanced: 'Balanced' }

export function PrivacyBadge() {
  const mode = useSettingsStore((state) => state.privacyMode)

  return (
    <Badge variant="outline">
      <ShieldCheck aria-hidden />
      <span className="sr-only">Privacy mode: </span>
      {LABELS[mode]}
    </Badge>
  )
}
