import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { TRY_PROJECT_NAME } from '@/app/tryDemo'
import { needsReload } from '@/stores/projectSession'
import { useProjectsStore } from '@/stores/projects'
import { queueStart } from '@/stores/projectStart'

/**
 * `/app/try` (F-HOME-04): opens the "Sample: Global Sales" project (made the first time), loads the
 * 1M-row sample and asks the demo question.
 */
export function TryRoute() {
  const [, navigate] = useLocation()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const store = useProjectsStore.getState()
      await store.hydrate()
      const project =
        useProjectsStore.getState().projects.find((p) => p.name === TRY_PROJECT_NAME) ??
        store.create(TRY_PROJECT_NAME)
      await queueStart(project.id, { kind: 'try' }, { persist: needsReload(project.id) })
      navigate(paths.project(project.id), { replace: true })
    })()
  }, [navigate])
  return null
}
