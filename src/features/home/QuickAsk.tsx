import { SendHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStartProject } from '@/features/home/useStartProject'
import type { Project } from '@/stores/projects'

/**
 * Asks in the project opened last (F-HOME-03). Its data comes back with kept files; without them the
 * question waits in the project's ask box until data is loaded.
 */
export function QuickAsk({ project }: { project: Project }) {
  const start = useStartProject()
  const [question, setQuestion] = useState('')
  const submit = () => {
    const text = question.trim()
    if (text) void start({ kind: 'ask', question: text }, { projectId: project.id })
  }
  return (
    <form
      className="flex items-center gap-2 rounded-2xl border bg-card p-2 pl-3 shadow-[0_6px_24px_-12px_rgb(0_0_0/0.18)] focus-within:ring-2 focus-within:ring-ring/30 dark:shadow-none"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Input
        aria-label={`Ask about ${project.name}`}
        placeholder={`Ask about ${project.name}…`}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        className="h-10 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button type="submit" size="icon-sm" aria-label="Ask" disabled={!question.trim()}>
        <SendHorizontal />
      </Button>
    </form>
  )
}
