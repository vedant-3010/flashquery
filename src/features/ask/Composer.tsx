import { KeyRound, SendHorizontal, Square } from 'lucide-react'
import { useMemo, useState, type Ref } from 'react'
import { DEMO_TABLE } from '@/ai/fixtures'
import { DEMO_QUESTIONS } from '@/ai/providers/fixture'
import { suggestQuestions } from '@/ai/suggestions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScopeMenu } from '@/features/ask/ScopeMenu'
import { useAskStore } from '@/stores/ask'
import { useDatasetsStore } from '@/stores/datasets'
import { activeApiKey, useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

/**
 * The ask box (F-ASK-01): Enter sends, Shift+Enter adds a line, Esc cancels a running question
 * (in AskView). Suggestion chips come from the data (F-PROF-03) or, in demo mode, the fixtures.
 */
export function Composer({ inputRef }: { inputRef?: Ref<HTMLTextAreaElement> }) {
  const [text, setText] = useState('')
  const ask = useAskStore((state) => state.ask)
  const cancel = useAskStore((state) => state.cancel)
  const running = useAskStore((state) => state.running !== null)
  const datasets = useDatasetsStore((state) => state.datasets)
  const demo = useSettingsStore((state) => activeApiKey(state) === null)
  const openSettings = useUiStore((state) => state.setSettingsOpen)
  const hasData = datasets.length > 0

  const suggestions = useMemo(() => {
    if (demo) return datasets.some((d) => d.table === DEMO_TABLE) ? DEMO_QUESTIONS.slice(0, 6) : []
    return suggestQuestions(datasets)
  }, [datasets, demo])

  const submit = () => {
    if (!text.trim() || !hasData) return
    void ask(text)
    setText('')
  }

  return (
    <div className="shrink-0 border-t bg-background p-3">
      <div className="mx-auto grid max-w-3xl gap-2">
        {suggestions.length > 0 && (
          <ul className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Suggested questions">
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
          </ul>
        )}
        <form
          className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:ring-2 focus-within:ring-ring/40"
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
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {running ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Cancel (Esc)"
              onClick={cancel}
            >
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Ask" disabled={!text.trim() || !hasData}>
              <SendHorizontal />
            </Button>
          )}
        </form>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {datasets.length > 1 && <ScopeMenu />}
          {demo ? (
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
