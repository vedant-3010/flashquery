import { isTryProject } from '@/app/tryDemo'
import type { RecordSpec } from '@/lib/idb'
import { DASHBOARDS_RECORD } from '@/stores/dashboard'
import { HISTORY_RECORD } from '@/stores/history'
import { PERSISTED_RECORD } from '@/stores/keptDatasets'
import { NOTES_RECORD } from '@/stores/notes'
import type { PROJECT_RECORD_KEYS } from '@/stores/projectScope'
import { useProjectsStore } from '@/stores/projects'
import { SUGGESTIONS_RECORD } from '@/stores/suggestions'
import { SyncEngine } from '@/stores/syncEngine'
import type { SyncMeta } from '@/stores/syncMeta'

// The sync engine as the app runs it (M17): the account through src/platform/vault.ts, the
// project list from the projects store, and each project record's spec (to check another device's
// copy is readable here before it's written).

type Api = typeof import('@/platform/vault')

const SPECS: Record<(typeof PROJECT_RECORD_KEYS)[number], RecordSpec<unknown>> = {
  history: HISTORY_RECORD,
  dashboards: DASHBOARDS_RECORD,
  notes: NOTES_RECORD,
  suggestions: SUGGESTIONS_RECORD,
  persistedDatasets: PERSISTED_RECORD,
}

export function createAppEngine({
  api,
  owner,
  key,
  meta,
  setMerging,
  onChangedElsewhere,
}: {
  api: Api
  /** The signed-in user (storage paths start with it). */
  owner: string
  key: CryptoKey
  meta: SyncMeta
  /** Around merging the account's project list (so it isn't taken for a change made here). */
  setMerging: (merging: boolean) => void
  /** The open project changed on another device. */
  onChangedElsewhere: () => void
}): SyncEngine {
  return new SyncEngine({
    remote: {
      putRecord: api.putRecord,
      getRecord: api.getRecord,
      pullChanges: api.pullChanges,
      deleteRecords: api.deleteRecords,
      deleteFile: (fileId, chunks) => api.deleteFile(owner, fileId, chunks),
    },
    key,
    meta,
    specs: SPECS,
    host: {
      projects: () => {
        const { projects, removed } = useProjectsStore.getState()
        return { projects, removed }
      },
      neverSyncs: isTryProject,
      applyProjects: (projects, removed, deleted) => {
        setMerging(true)
        try {
          return useProjectsStore.getState().applyMerged(projects, removed, deleted)
        } finally {
          setMerging(false)
        }
      },
      changedElsewhere: (projectId) => {
        if (useProjectsStore.getState().openId === projectId) onChangedElsewhere()
      },
    },
  })
}
