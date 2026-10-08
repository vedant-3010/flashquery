// Voice questions (F-ASK-17, D106) with the browser's on-device speech recognition only. Chrome
// offers it through SpeechRecognition.available()/install() and the `processLocally` flag. A browser
// that can't promise the audio stays on this device gets no voice input at all: we never start a
// recognizer that might stream audio to a cloud service.

export type SpeechSupport =
  /** No on-device recognition in this browser. */
  | 'unsupported'
  /** On-device recognition exists, but not for this language. */
  | 'unavailable'
  /** The language pack can be downloaded (once, by the browser). */
  | 'downloadable'
  | 'downloading'
  | 'available'

interface Alternative {
  readonly transcript: string
}
interface Result {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: Alternative | undefined
}
export interface RecognitionEvent {
  readonly resultIndex: number
  readonly results: ArrayLike<Result>
}

export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

interface OnDevice {
  langs: string[]
  processLocally: true
}

export interface RecognitionConstructor {
  new (): Recognition
  prototype: object
  available?: (options: OnDevice) => Promise<string>
  install?: (options: OnDevice) => Promise<boolean>
}

const STATES: readonly string[] = ['unavailable', 'downloadable', 'downloading', 'available']

/**
 * The browser's recognizer, if it can run on the device: it has the static available() check and
 * the processLocally flag. Anything older is treated as having no voice input.
 */
export function recognitionConstructor(scope: object = globalThis): RecognitionConstructor | null {
  const found = scope as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  const ctor = found.SpeechRecognition ?? found.webkitSpeechRecognition
  if (!ctor || typeof ctor.available !== 'function') return null
  return 'processLocally' in ctor.prototype ? ctor : null
}

export async function speechSupport(
  ctor: RecognitionConstructor | null,
  lang: string,
): Promise<SpeechSupport> {
  if (!ctor?.available) return 'unsupported'
  try {
    const state = await ctor.available({ langs: [lang], processLocally: true })
    return STATES.includes(state) ? (state as SpeechSupport) : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** Downloads the on-device language pack; true once it's installed. */
export async function installSpeech(
  ctor: RecognitionConstructor | null,
  lang: string,
): Promise<boolean> {
  if (!ctor?.install) return false
  try {
    return await ctor.install({ langs: [lang], processLocally: true })
  } catch {
    return false
  }
}

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim()

/** The words so far: the settled ones, and the ones the recognizer is still working out. */
export function readResults(results: ArrayLike<Result>): { final: string; interim: string } {
  let final = ''
  let interim = ''
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i]
    const text = result?.[0]?.transcript ?? ''
    if (result?.isFinal) final += ` ${text}`
    else interim += ` ${text}`
  }
  return { final: tidy(final), interim: tidy(interim) }
}

/** The question box's text: what was typed before, then the spoken words. */
export function joinSpoken(typed: string, spoken: { final: string; interim: string }): string {
  return [typed.trim(), spoken.final, spoken.interim].filter(Boolean).join(' ')
}

export interface ListenHandlers {
  onText: (spoken: { final: string; interim: string }) => void
  /** True while speech is heard, false in the pauses. */
  onSpeech: (speaking: boolean) => void
  onError: (code: string) => void
  onEnd: () => void
}

export interface Listening {
  stop(): void
  abort(): void
}

export function listen(
  ctor: RecognitionConstructor,
  lang: string,
  handlers: ListenHandlers,
): Listening {
  const recognition = new ctor()
  recognition.lang = lang
  recognition.continuous = true
  recognition.interimResults = true
  // Never a cloud service (D106): without on-device support, recognition fails instead.
  recognition.processLocally = true
  recognition.onresult = (event) => handlers.onText(readResults(event.results))
  recognition.onspeechstart = () => handlers.onSpeech(true)
  recognition.onspeechend = () => handlers.onSpeech(false)
  recognition.onerror = (event) => {
    // Stopping, or a pause with nothing said, isn't worth a message.
    if (event.error !== 'aborted' && event.error !== 'no-speech') handlers.onError(event.error)
  }
  recognition.onend = handlers.onEnd
  recognition.start()
  return { stop: () => recognition.stop(), abort: () => recognition.abort() }
}

/** A plain message for a recognizer error code. */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return "Microphone access is blocked. Allow it in the browser's site settings, then try again."
    case 'audio-capture':
      return 'No microphone was found.'
    case 'language-not-supported':
      return "Voice input doesn't support this language on this device."
    default:
      return `Voice input stopped (${code}).`
  }
}

/** Why the mic is off, or null when it can be used. */
export function unavailableReason(support: SpeechSupport | 'unknown' | 'checking'): string | null {
  if (support === 'unsupported')
    return "Voice input needs on-device speech recognition, which this browser doesn't offer (Chrome does). Typing works as usual."
  if (support === 'unavailable')
    return "On-device speech recognition isn't available for this language here. Typing works as usual."
  return null
}
