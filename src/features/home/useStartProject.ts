import { useCallback } from 'react'
import { useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { needsReload } from '@/stores/projectSession'
import { useProjectsStore } from '@/stores/projects'
import { queueStart, type StartAction } from '@/stores/projectStart'

/**
 * Opens a project (an existing one, or a new one named `name`) and, once it's open, runs `action`:
 * load a sample or files, import a workspace, or ask a question (F-HOME-03).
 */
export function useStartProject() {
  const [, navigate] = useLocation()
  return useCallback(
    async (
      action: StartAction | null,
      target: { projectId?: string; name?: string; newId?: string } = {},
    ) => {
      const store = useProjectsStore.getState()
      await store.hydrate()
      const id = target.projectId ?? store.create(target.name, target.newId).id
      if (action) await queueStart(id, action, { persist: needsReload(id) })
      navigate(paths.project(id))
    },
    [navigate],
  )
}
