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
      className="flex items-center gap-2 rounded-xl border bg-card p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring/50"
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
        className="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button type="submit" size="icon-sm" aria-label="Ask" disabled={!question.trim()}>
        <SendHorizontal />
      </Button>
    </form>
  )
}
