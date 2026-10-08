import { describe, expect, it, vi } from 'vitest'
import {
  joinSpoken,
  listen,
  readResults,
  recognitionConstructor,
  speechSupport,
  unavailableReason,
  type Recognition,
  type RecognitionConstructor,
  type RecognitionEvent,
} from './speech'

// Voice input (F-ASK-17, D106): only an on-device recognizer is ever used.

class FakeRecognition implements Recognition {
  static available = vi.fn(
    async (_options: { langs: string[]; processLocally: true }) => 'available',
  )
  static install = vi.fn(async () => true)
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  #local = false
  get processLocally() {
    return this.#local
  }
  set processLocally(on: boolean) {
    this.#local = on
  }
  onresult: ((event: RecognitionEvent) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  onspeechstart: (() => void) | null = null
  onspeechend: (() => void) | null = null
  started = false
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.started = true
  }
  stop() {}
  abort() {}
}

const result = (transcript: string, isFinal: boolean) =>
  Object.assign([{ transcript }], { isFinal })

describe('on-device speech (F-ASK-17)', () => {
  it('only offers a recognizer that can promise to stay on the device', () => {
    expect(recognitionConstructor({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition)
    expect(recognitionConstructor({ webkitSpeechRecognition: FakeRecognition })).toBe(
      FakeRecognition,
    )
    // Older recognizers (no available(), no processLocally) may stream audio to a cloud service.
    class Cloud {
      start() {}
    }
    expect(recognitionConstructor({ webkitSpeechRecognition: Cloud })).toBeNull()
    class NoFlag {
      static async available() {
        return 'available'
      }
    }
    expect(recognitionConstructor({ SpeechRecognition: NoFlag })).toBeNull()
    expect(recognitionConstructor({})).toBeNull()
  })

  it('asks for on-device support in the given language', async () => {
    const ctor = FakeRecognition as unknown as RecognitionConstructor
    expect(await speechSupport(ctor, 'de-DE')).toBe('available')
    expect(FakeRecognition.available).toHaveBeenLastCalledWith({
      langs: ['de-DE'],
      processLocally: true,
    })
    FakeRecognition.available.mockResolvedValueOnce('downloadable')
    expect(await speechSupport(ctor, 'en-US')).toBe('downloadable')
    FakeRecognition.available.mockResolvedValueOnce('something-new')
    expect(await speechSupport(ctor, 'en-US')).toBe('unavailable')
    FakeRecognition.available.mockRejectedValueOnce(new Error('nope'))
    expect(await speechSupport(ctor, 'en-US')).toBe('unavailable')
    expect(await speechSupport(null, 'en-US')).toBe('unsupported')
    expect(unavailableReason('unsupported')).toContain('on-device')
    expect(unavailableReason('unknown')).toBeNull()
  })

  it('reads settled and in-progress words, after anything typed first', () => {
    const spoken = readResults([result('which region', true), result(' grew fast', false)])
    expect(spoken).toEqual({ final: 'which region', interim: 'grew fast' })
    expect(joinSpoken('', spoken)).toBe('which region grew fast')
    expect(joinSpoken('In 2025,', { final: 'which region', interim: '' })).toBe(
      'In 2025, which region',
    )
  })

  it('listens on the device only, and passes words, pauses and real errors on', () => {
    const handlers = { onText: vi.fn(), onSpeech: vi.fn(), onError: vi.fn(), onEnd: vi.fn() }
    listen(FakeRecognition as unknown as RecognitionConstructor, 'en-IN', handlers)
    const recognition = FakeRecognition.last
    expect(recognition).toMatchObject({
      lang: 'en-IN',
      continuous: true,
      interimResults: true,
      processLocally: true,
      started: true,
    })
    recognition?.onspeechstart?.()
    expect(handlers.onSpeech).toHaveBeenLastCalledWith(true)
    recognition?.onresult?.({ resultIndex: 0, results: [result('total revenue', true)] })
    expect(handlers.onText).toHaveBeenLastCalledWith({ final: 'total revenue', interim: '' })
    recognition?.onerror?.({ error: 'no-speech' })
    recognition?.onerror?.({ error: 'aborted' })
    expect(handlers.onError).not.toHaveBeenCalled()
    recognition?.onerror?.({ error: 'not-allowed' })
    expect(handlers.onError).toHaveBeenCalledWith('not-allowed')
    recognition?.onend?.()
    expect(handlers.onEnd).toHaveBeenCalled()
  })
})
