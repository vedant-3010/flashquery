import { SendHorizontal, Sparkles } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function WorkspaceView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section aria-label="Answers" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <EmptyState
          icon={Sparkles}
          title="Ask a question about your data"
          description="Answers appear here with a chart, the SQL behind them and a plain-English explanation. Queries run on this device."
        />
      </section>
      {/* Composer placeholder; F-ASK-01 (M3) makes it live. */}
      <form className="shrink-0 border-t p-3" onSubmit={(event) => event.preventDefault()}>
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            aria-label="Ask a question"
            placeholder="Load a dataset to start asking questions"
            rows={2}
            disabled
            className="min-h-0 resize-none"
          />
          <Button type="submit" size="icon" aria-label="Ask" disabled>
            <SendHorizontal />
          </Button>
        </div>
      </form>
    </div>
  )
}
