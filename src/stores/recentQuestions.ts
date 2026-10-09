import { idbStore, loadRecord, type KeyValueStore } from '@/lib/idb'
import { HISTORY_RECORD } from '@/stores/history'
import { projectKey } from '@/stores/projectScope'
import type { Project } from '@/stores/projects'

// Home's recent questions (F-HOME-03): the newest questions across projects, read from each
// project's saved history without opening it.

export interface RecentQuestion {
  projectId: string
  projectName: string
  question: string
  at: number
}

export async function loadRecentQuestions(
  projects: readonly Pick<Project, 'id' | 'name'>[],
  { store = idbStore, limit = 6 }: { store?: KeyValueStore; limit?: number } = {},
): Promise<RecentQuestion[]> {
  const perProject = await Promise.all(
    projects.map(async (project) => {
      const spec = { ...HISTORY_RECORD, key: projectKey(project.id, HISTORY_RECORD.key) }
      const entries = await loadRecord(spec, { store, readOnly: true }).catch(() => [])
      return entries
        .filter((entry) => entry.kind === 'question')
        .map((entry) => ({
          projectId: project.id,
          projectName: project.name,
          question: entry.text,
          at: entry.at,
        }))
    }),
  )
  const seen = new Set<string>()
  return perProject
    .flat()
    .sort((a, b) => b.at - a.at)
    .filter((recent) => {
      const key = `${recent.projectId}\n${recent.question.trim().toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
}
