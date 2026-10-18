import { describe, expect, it } from 'vitest'
import {
  MAX_REMOVED,
  mergeProjects,
  mergeRemoved,
  remoteWins,
  unreferencedFiles,
  type RemovedProject,
} from '@/lib/syncMerge'

// Merging another device's saves (M17, F-SYNC-03): later changes win, removed projects stay removed.

interface P {
  id: string
  name: string
  updatedAt: number
  lastOpenedAt: number
  localOnly: boolean
}

const project = (id: string, updatedAt: number, extra: Partial<P> = {}): P => ({
  id,
  name: id,
  updatedAt,
  lastOpenedAt: updatedAt,
  localOnly: false,
  ...extra,
})
const keepHere = (p: P) => p.localOnly || p.id.startsWith('try-')
const ids = (list: readonly P[]) => list.map((p) => p.id).sort()

describe('mergeProjects', () => {
  it('brings in projects made elsewhere and keeps the ones made here', () => {
    const merged = mergeProjects(
      [project('a', 10)],
      [],
      { projects: [project('b', 20)], removed: [] },
      keepHere,
    )
    expect(ids(merged.projects)).toEqual(['a', 'b'])
    expect(merged.deleted).toEqual([])
  })

  it('takes the later change of a project both devices have', () => {
    const local = [project('a', 10, { name: 'Mine' })]
    const newer = mergeProjects(
      local,
      [],
      { projects: [project('a', 30, { name: 'Renamed elsewhere' })], removed: [] },
      keepHere,
    )
    expect(newer.projects[0]?.name).toBe('Renamed elsewhere')
    const older = mergeProjects(
      local,
      [],
      { projects: [project('a', 5, { name: 'Old' })], removed: [] },
      keepHere,
    )
    expect(older.projects[0]?.name).toBe('Mine')
  })

  it('keeps the latest time a project was opened on either device', () => {
    const merged = mergeProjects(
      [project('a', 10, { lastOpenedAt: 50 })],
      [],
      { projects: [project('a', 30, { lastOpenedAt: 40 })], removed: [] },
      keepHere,
    )
    expect(merged.projects[0]).toMatchObject({ updatedAt: 30, lastOpenedAt: 50 })
  })

  it('removes a project deleted elsewhere, unless it changed here afterwards', () => {
    const removed: RemovedProject[] = [
      { id: 'a', at: 20, kind: 'deleted' },
      { id: 'b', at: 20, kind: 'deleted' },
    ]
    const merged = mergeProjects(
      [project('a', 10), project('b', 25)],
      [],
      { projects: [], removed },
      keepHere,
    )
    expect(merged.deleted).toEqual(['a'])
    expect(ids(merged.projects)).toEqual(['b'])
    // And a deleted project doesn't come back from the account's list either.
    const fromRemote = mergeProjects(
      [],
      removed,
      { projects: [project('a', 10)], removed: [] },
      keepHere,
    )
    expect(fromRemote.projects).toEqual([])
  })

  it('keeps a project another device took off the account, but stops syncing it', () => {
    const merged = mergeProjects(
      [project('a', 10)],
      [],
      { projects: [], removed: [{ id: 'a', at: 20, kind: 'unsynced' }] },
      keepHere,
    )
    expect(merged.unsynced).toEqual(['a'])
    expect(merged.projects[0]).toMatchObject({ id: 'a', localOnly: true })
  })

  it('never touches local-only or try projects', () => {
    const merged = mergeProjects(
      [project('mine', 10, { localOnly: true, name: 'Private' }), project('try-sales', 10)],
      [],
      {
        projects: [project('mine', 99, { name: 'From elsewhere' })],
        removed: [{ id: 'try-sales', at: 50, kind: 'deleted' }],
      },
      keepHere,
    )
    expect(merged.projects.find((p) => p.id === 'mine')?.name).toBe('Private')
    expect(ids(merged.projects)).toEqual(['mine', 'try-sales'])
    expect(merged.deleted).toEqual([])
  })
})

describe('mergeRemoved', () => {
  it('keeps the latest marker per project, newest first, capped', () => {
    const merged = mergeRemoved(
      [{ id: 'a', at: 10, kind: 'unsynced' }],
      [
        { id: 'a', at: 20, kind: 'deleted' },
        { id: 'b', at: 5, kind: 'deleted' },
      ],
    )
    expect(merged).toEqual([
      { id: 'a', at: 20, kind: 'deleted' },
      { id: 'b', at: 5, kind: 'deleted' },
    ])
    const many = Array.from({ length: MAX_REMOVED + 10 }, (_, i) => ({
      id: `p${i}`,
      at: i,
      kind: 'deleted' as const,
    }))
    expect(mergeRemoved(many, [])).toHaveLength(MAX_REMOVED)
    expect(mergeRemoved(many, [])[0]?.at).toBe(MAX_REMOVED + 9)
  })
})

describe('remoteWins', () => {
  it('takes the later save, and anything over nothing', () => {
    expect(remoteWins(undefined, { savedAt: 1 })).toBe(true)
    expect(remoteWins({ savedAt: 1 }, { savedAt: 2 })).toBe(true)
    expect(remoteWins({ savedAt: 2 }, { savedAt: 2 })).toBe(false)
    expect(remoteWins({ savedAt: 3 }, { savedAt: 2 })).toBe(false)
  })
})

describe('unreferencedFiles', () => {
  it('finds files nothing mentions, once they are a day old', () => {
    const day = 24 * 60 * 60 * 1000
    const now = 10 * day
    const files = [
      { fileId: 'kept', createdAt: 0 },
      { fileId: 'orphan', createdAt: 0 },
      { fileId: 'uploading', createdAt: now - 1000 },
    ]
    expect(unreferencedFiles(files, new Set(['kept']), now)).toEqual(['orphan'])
  })
})
