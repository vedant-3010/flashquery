import { ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

/**
 * Before the first hosted question (F-PLAN-01, D119): what goes through HushGlance's server, in
 * this privacy mode, and that nobody keeps it. Shown until dismissed.
 */
export function HostedNotice() {
  const seen = useSettingsStore((state) => state.hostedNoticeSeen)
  const mode = useSettingsStore((state) => state.privacyMode)
  const dismiss = useSettingsStore((state) => state.setHostedNoticeSeen)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  if (seen) return null
  return (
    <aside
      aria-label="About HushGlance AI"
      className="mb-2 flex items-start gap-2.5 rounded-xl border bg-muted/40 p-3 text-xs"
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <div className="grid flex-1 gap-1">
        <p className="font-medium text-foreground">You’re asking with HushGlance AI</p>
        <p className="text-muted-foreground">
          Your question and{' '}
          {mode === 'strict'
            ? 'your tables’ names and column types (Strict mode: no values)'
            : 'your tables’ structure with a few sample values (Balanced mode)'}{' '}
          go through our server and OpenRouter to the model. Every request demands zero data
          retention: none of us keeps it.{mode === 'strict' && ' No row of your data reaches it.'}
        </p>
        <p>
          <Button
            size="xs"
            variant="link"
            className="h-auto px-0"
            onClick={() => openSettings(true)}
          >
            Privacy and AI settings
          </Button>
        </p>
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Got it"
        title="Got it"
        onClick={() => dismiss(true)}
      >
        <X aria-hidden />
      </Button>
    </aside>
  )
}
