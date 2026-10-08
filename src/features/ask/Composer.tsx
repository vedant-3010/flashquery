import { KeyRound, LoaderCircle, Mic, SendHorizontal, Sparkles, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { DEMO_TABLE } from '@/ai/fixtures'
import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { suggestionKey } from '@/ai/suggest'
import { suggestQuestions } from '@/ai/suggestions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EffortMenu } from '@/features/ask/EffortMenu'
import { MicButton } from '@/features/ask/MicButton'
import { ModelMenu } from '@/features/ask/ModelMenu'
import { PrivacyMenu } from '@/features/ask/PrivacyMenu'
import { ScopeMenu } from '@/features/ask/ScopeMenu'
import { joinSpoken, unavailableReason } from '@/features/ask/speech'
import { useSpeechInput } from '@/features/ask/useSpeechInput'
import { useAskStore } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useSuggestionsStore } from '@/stores/suggestions'
import { useUiStore } from '@/stores/ui'

/**
 * The ask box (F-ASK-01): Enter sends, Shift+Enter adds a line, Esc cancels a running question
 * (in AskView). Suggestion chips come from the data (F-PROF-03), the AI on request in Balanced mode
 * (F-PROF-04, cached per schema) or, in demo mode, the fixtures. Its toolbar picks the tables,
 * privacy mode, model and effort (F-ASK-16), and holds the mic (F-ASK-17).
 */
export function Composer({ inputRef }: { inputRef?: Ref<HTMLTextAreaElement> }) {
  const [text, setText] = useState('')
  const ask = useAskStore((state) => state.ask)
  const cancel = useAskStore((state) => state.cancel)
  const running = useAskStore((state) => state.running !== null)
  const datasets = useDatasetsStore((state) => state.datasets)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const scope = useAskStore((state) => state.scope)
  const balanced = useSettingsStore((state) => state.privacyMode === 'balanced')
  const aiByKey = useSuggestionsStore((state) => state.byKey)
  const aiPending = useSuggestionsStore((state) => state.pending)
  const aiError = useSuggestionsStore((state) => state.error)
  const requestAi = useSuggestionsStore((state) => state.request)
  const active = useUiStore((state) => state.view === 'workspace')
  const locale = useSettingsStore((state) => state.locale)
  const speech = useSpeechInput(locale)
  const [micNote, setMicNote] = useState<string | null>(null)
  const typedBefore = useRef('')
  // Bumped when a question is sent, so a late result can't refill the emptied box.
  const micRun = useRef(0)
  const hasData = datasets.length > 0
  const listening = speech.state === 'listening'

  const scoped = useMemo(
    () => (scope === null ? datasets : datasets.filter((d) => scope.includes(d.table))),
    [datasets, scope],
  )
  const key = suggestionKey(scoped)
  const aiQuestions = demo ? undefined : aiByKey[key]
  const canAskAi = !demo && balanced && scoped.length > 0 && !aiQuestions

  const suggestions = useMemo(() => {
    if (demo) return datasets.some((d) => d.table === DEMO_TABLE) ? DEMO_QUESTIONS.slice(0, 6) : []
    return aiQuestions ?? suggestQuestions(scoped)
  }, [datasets, scoped, demo, aiQuestions])

  const submit = () => {
    if (!text.trim() || !hasData) return
    micRun.current += 1
    speech.abort()
    void ask(text)
    setText('')
  }

  // Spoken words go after whatever was typed before the mic was turned on.
  const toggleMic = () => {
    const reason = unavailableReason(speech.support)
    setMicNote(reason)
    if (reason || !hasData) return
    if (listening) {
      speech.stop()
      return
    }
    typedBefore.current = text
    const run = (micRun.current += 1)
    void speech.start((spoken) => {
      if (micRun.current === run) setText(joinSpoken(typedBefore.current, spoken))
    })
  }

  // ⌘/Ctrl+Shift+Space starts or stops listening; Esc stops it. The handler reads the latest
  // render's state through a ref, so the listener is added once.
  const onMicKey = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    onMicKey.current = (event) => {
      if (event.code === 'Space' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleMic()
      } else if (event.key === 'Escape' && listening) {
        speech.stop()
      }
    }
  })
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => onMicKey.current(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active])

  return (
    <div className="shrink-0 border-t bg-background p-3">
      <div className="mx-auto grid max-w-3xl gap-2">
        {(suggestions.length > 0 || canAskAi) && (
          <ul className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Suggested questions">
            {aiQuestions && (
              <li className="flex shrink-0 items-center" title="Suggested by the AI">
                <Sparkles className="size-3.5 text-muted-foreground" aria-label="AI suggestions" />
              </li>
            )}
            {suggestions.map((question) => (
              <li key={question} className="shrink-0">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={running}
                  onClick={() => void ask(question)}
                >
                  {question}
                </Button>
              </li>
            ))}
            {canAskAi && (
              <li className="shrink-0">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={aiPending === key}
                  title={
                    aiError ??
                    'Sends the schema and a few sample values (Balanced mode), like a question does.'
                  }
                  onClick={() => void requestAi(scoped)}
                >
                  {aiPending === key ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <Sparkles aria-hidden />
                  )}
                  {aiPending === key
                    ? 'Suggesting…'
                    : aiError
                      ? 'Suggest with AI (failed, retry)'
                      : 'Suggest with AI'}
                </Button>
              </li>
            )}
          </ul>
        )}
        <form
          className="rounded-xl border bg-card focus-within:ring-2 focus-within:ring-ring/40"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Textarea
            ref={inputRef}
            aria-label="Ask a question"
            placeholder={
              hasData
                ? 'Ask a question about your data…  (press / to focus)'
                : 'Load a dataset to start asking questions'
            }
            disabled={!hasData}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
            className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-3 pt-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex flex-wrap items-center gap-0.5 px-1.5 pb-1.5">
            {datasets.length > 1 && <ScopeMenu />}
            <PrivacyMenu />
            <div className="ml-auto flex items-center gap-0.5">
              <ModelMenu />
              <EffortMenu />
              <MicButton speech={speech} disabled={!hasData || running} onToggle={toggleMic} />
              {running ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Cancel (Esc)"
                  onClick={cancel}
                >
                  <Square />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon-sm"
                  aria-label="Ask"
                  disabled={!text.trim() || !hasData}
                >
                  <SendHorizontal />
                </Button>
              )}
            </div>
          </div>
        </form>
        <div
          role="status"
          className="flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          {listening ? (
            <span className="flex items-center gap-1.5 text-foreground">
              <Mic className="size-3.5" aria-hidden />
              Listening, on this device. Press Enter to ask, or Esc to stop.
            </span>
          ) : speech.state === 'installing' ? (
            <span>Downloading the voice model (once). Your voice will stay on this device.</span>
          ) : (speech.error ?? micNote) ? (
            <span className="text-destructive">{speech.error ?? micNote}</span>
          ) : demo ? (
            <span className="flex flex-wrap items-center gap-1">
              Demo mode: answers are pre-recorded; SQL runs live on your device.
              <Button
                size="xs"
                variant="link"
                className="h-auto px-0"
                onClick={() => openSettings(true)}
              >
                <KeyRound aria-hidden />
                Add an API key to ask anything
              </Button>
            </span>
          ) : (
            <span>Only what your privacy mode allows is sent to the AI. Results stay here.</span>
          )}
        </div>
      </div>
    </div>
  )
}
