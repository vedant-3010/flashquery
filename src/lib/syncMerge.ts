import { z } from '@/lib/zod'

// Merging what another device saved (M17, F-SYNC-03, D123). Pure.
//
// - The project list merges project by project: the later change wins, and a removed project
//   leaves a marker (`RemovedProject`) so it disappears on every device instead of coming back from
//   one that still has it.
// - A project's records (history, dashboards, notes, suggestions, the file list) are each one unit:
//   the later save wins. Two devices editing the same project at the same moment keep the later one.
// - Times are the devices' clocks.

export const RemovedProjectSchema = z.object({
  id: z.string(),
  at: z.number(),
  /**
   * 'deleted': gone everywhere. 'unsynced': taken off the account ("Keep on this device only"):
   * other devices keep their copy, but stop saving it to the account.
   */
  kind: z.enum(['deleted', 'unsynced']),
})
export type RemovedProject = z.infer<typeof RemovedProjectSchema>

/** At most this many markers are kept (newest first): enough for years of deleting projects. */
export const MAX_REMOVED = 500

interface MergeableProject {
  id: string
  updatedAt: number
  lastOpenedAt: number
  localOnly: boolean
}

export interface ProjectsMerge<P> {
  /** This device's list after the merge. */
  projects: P[]
  removed: RemovedProject[]
  /** Deleted on another device: this device drops their records and files too. */
  deleted: string[]
  /** Taken off the account on another device: kept here, no longer saved to the account. */
  unsynced: string[]
}

/** Both lists of markers, the latest per project. */
export function mergeRemoved(
  a: readonly RemovedProject[],
  b: readonly RemovedProject[],
): RemovedProject[] {
  const latest = new Map<string, RemovedProject>()
  for (const marker of [...a, ...b]) {
    const seen = latest.get(marker.id)
    if (!seen || marker.at > seen.at) latest.set(marker.id, marker)
  }
  return [...latest.values()]
    .sort((x, y) => y.at - x.at || x.id.localeCompare(y.id))
    .slice(0, MAX_REMOVED)
}

/**
 * This device's projects merged with the account's. `keepHere(project)`: projects that never sync
 * (local-only, the try projects); the account's copy of one is ignored.
 */
export function mergeProjects<P extends MergeableProject>(
  local: readonly P[],
  localRemoved: readonly RemovedProject[],
  remote: { projects: readonly P[]; removed: readonly RemovedProject[] },
  keepHere: (project: P) => boolean,
): ProjectsMerge<P> {
  const removed = mergeRemoved(localRemoved, remote.removed)
  const markers = new Map(removed.map((marker) => [marker.id, marker]))
  const remoteById = new Map(remote.projects.map((project) => [project.id, project]))
  const merged: P[] = []
  const deleted: string[] = []
  const unsynced: string[] = []

  for (const project of local) {
    if (keepHere(project)) {
      merged.push(project)
      continue
    }
    const theirs = remoteById.get(project.id)
    const lastOpenedAt = Math.max(project.lastOpenedAt, theirs?.lastOpenedAt ?? 0)
    const winner =
      theirs && theirs.updatedAt > project.updatedAt
        ? { ...theirs, localOnly: false, lastOpenedAt }
        : { ...project, lastOpenedAt }
    const marker = markers.get(project.id)
    if (marker && marker.at >= winner.updatedAt) {
      if (marker.kind === 'deleted') {
        deleted.push(project.id)
      } else {
        unsynced.push(project.id)
        merged.push({ ...project, localOnly: true })
      }
      continue
    }
    merged.push(winner)
  }

  const here = new Set(local.map((project) => project.id))
  for (const project of remote.projects) {
    if (here.has(project.id)) continue
    const marker = markers.get(project.id)
    if (marker && marker.at >= project.updatedAt) continue
    merged.push({ ...project, localOnly: false })
  }
  return { projects: merged, removed, deleted, unsynced }
}

/** Whether another device's copy of a record replaces this device's: the later save wins. */
export function remoteWins(
  local: { savedAt: number } | undefined,
  remote: { savedAt: number },
): boolean {
  return local === undefined || remote.savedAt > local.savedAt
}

/**
 * Files saved to the account that no project's file list mentions any more (the dataset or its
 * project was removed). Files reserved within `graceMs` are left alone: another device may still
 * be uploading them.
 */
export function unreferencedFiles(
  files: readonly { fileId: string; createdAt: number }[],
  referenced: ReadonlySet<string>,
  now: number,
  graceMs = 24 * 60 * 60 * 1000,
): string[] {
  return files
    .filter((file) => !referenced.has(file.fileId) && now - file.createdAt > graceMs)
    .map((file) => file.fileId)
}
