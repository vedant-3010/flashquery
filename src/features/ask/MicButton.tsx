import { LoaderCircle, Mic, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { unavailableReason } from '@/features/ask/speech'
import type { SpeechInput } from '@/features/ask/useSpeechInput'
import { cn } from '@/lib/utils'

/**
 * The ask bar's mic (F-ASK-17). Where on-device recognition is missing it looks off and is named
 * "unavailable", but stays pressable: pressing it says why (in the line under the box) instead of
 * silently doing nothing.
 */
export function MicButton({
  speech,
  disabled,
  onToggle,
}: {
  speech: SpeechInput
  disabled: boolean
  onToggle: () => void
}) {
  const { support, state, hearing } = speech
  const listening = state === 'listening'
  const off = unavailableReason(support) !== null
  const title = off
    ? (unavailableReason(support) ?? undefined)
    : listening
      ? 'Stop (Esc)'
      : `Ask by voice (${shortcut()}). Your voice stays on this device${support === 'downloadable' ? '; the first use downloads a voice model' : ''}.`

  return (
    <Button
      type="button"
      size="icon-sm"
      variant={listening ? 'default' : 'ghost'}
      aria-label={
        listening ? 'Stop voice input' : off ? 'Voice input (unavailable)' : 'Ask by voice'
      }
      aria-pressed={listening}
      title={title}
      disabled={disabled || state === 'installing' || support === 'checking'}
      className={cn('relative', off && 'opacity-50')}
      onClick={onToggle}
    >
      {state === 'installing' ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : off ? (
        <MicOff aria-hidden />
      ) : (
        <Mic aria-hidden />
      )}
      {listening && hearing && (
        <span
          aria-hidden
          className="absolute inset-0 animate-ping rounded-[inherit] bg-primary/40 motion-reduce:animate-none"
        />
      )}
    </Button>
  )
}

function shortcut() {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘⇧Space' : 'Ctrl+Shift+Space'
}
