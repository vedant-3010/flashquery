import { useEffect, useMemo, useRef, useState } from 'react'
import {
  installSpeech,
  listen,
  recognitionConstructor,
  speechErrorMessage,
  speechSupport,
  unavailableReason,
  type Listening,
  type ListenHandlers,
  type SpeechSupport,
} from '@/features/ask/speech'

export type SpeechStatus =
  | SpeechSupport
  /** The browser has the on-device API, but hasn't been asked about this language yet. */
  | 'unknown'
  | 'checking'

export interface SpeechInput {
  support: SpeechStatus
  state: 'idle' | 'installing' | 'listening'
  /** Speech is being heard right now (between pauses). */
  hearing: boolean
  error: string | null
  start: (onText: ListenHandlers['onText']) => Promise<void>
  /** Stops after the words already heard. */
  stop: () => void
  /** Stops at once, dropping anything not yet recognized. */
  abort: () => void
}

/**
 * On-device voice input (F-ASK-17) in `lang`; see speech.ts. The browser is asked whether it can
 * recognize `lang` on the device only when the mic is first pressed: some Chromium builds crash the
 * tab on that question, so it must never happen just because the ask box is on screen.
 */
export function useSpeechInput(lang: string): SpeechInput {
  const ctor = useMemo(() => recognitionConstructor(), [])
  const [checked, setChecked] = useState<{ lang: string; support: SpeechSupport } | null>(null)
  const [checking, setChecking] = useState(false)
  const [state, setState] = useState<SpeechInput['state']>('idle')
  const [hearing, setHearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<Listening | null>(null)

  // Stop listening when the ask box goes away.
  useEffect(() => () => session.current?.abort(), [])

  const known = checked?.lang === lang ? checked.support : null
  const support: SpeechStatus = !ctor ? 'unsupported' : checking ? 'checking' : (known ?? 'unknown')

  const start = async (onText: ListenHandlers['onText']) => {
    if (!ctor || session.current || state !== 'idle' || checking) return
    setError(null)
    let ready = known
    if (ready === null || ready === 'downloadable' || ready === 'downloading') {
      setChecking(true)
      ready = await speechSupport(ctor, lang)
      setChecking(false)
      setChecked({ lang, support: ready })
    }
    if (ready === 'downloadable' || ready === 'downloading') {
      setState('installing')
      ready = (await installSpeech(ctor, lang)) ? 'available' : await speechSupport(ctor, lang)
      setChecked({ lang, support: ready })
      if (ready !== 'available') {
        setState('idle')
        setError("The voice model couldn't be downloaded. Check the connection and try again.")
        return
      }
    }
    if (ready !== 'available') {
      setError(unavailableReason(ready))
      return
    }
    try {
      session.current = listen(ctor, lang, {
        onText,
        onSpeech: setHearing,
        onError: (code) => setError(speechErrorMessage(code)),
        onEnd: () => {
          session.current = null
          setHearing(false)
          setState('idle')
        },
      })
      setState('listening')
    } catch (caught) {
      // e.g. the recognizer refuses to start (another tab is listening).
      setError(speechErrorMessage(caught instanceof Error ? caught.message : String(caught)))
    }
  }

  const stop = () => session.current?.stop()
  const abort = () => session.current?.abort()

  return { support, state, hearing, error, start, stop, abort }
}
