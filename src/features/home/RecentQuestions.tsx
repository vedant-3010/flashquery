import { MessageSquareText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStartProject } from '@/features/home/useStartProject'
import { formatAgo } from '@/lib/format'
import type { Project } from '@/stores/projects'
import { loadRecentQuestions, type RecentQuestion } from '@/stores/recentQuestions'
import { useSettingsStore } from '@/stores/settings'

/** The newest questions across projects (F-HOME-03); one asks it again in its project. */
export function RecentQuestions({ projects }: { projects: Project[] }) {
  const start = useStartProject()
  const locale = useSettingsStore((state) => state.locale)
  const [recent, setRecent] = useState<RecentQuestion[] | null>(null)

  useEffect(() => {
    let live = true
    void loadRecentQuestions(projects).then((found) => {
      if (live) setRecent(found)
    })
    return () => {
      live = false
    }
  }, [projects])

  if (!recent || recent.length === 0) return null
  return (
    <section aria-labelledby="home-recent" className="grid gap-3">
      <h2 id="home-recent" className="text-sm font-medium">
        Recent questions
      </h2>
      <ul className="grid divide-y rounded-xl border bg-card">
        {recent.map((item) => (
          <li key={`${item.projectId}-${item.at}`}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
              onClick={() =>
                void start({ kind: 'ask', question: item.question }, { projectId: item.projectId })
              }
            >
              <MessageSquareText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.question}</span>
              <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline sm:max-w-48">
                {item.projectName} · {formatAgo(item.at, locale)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
