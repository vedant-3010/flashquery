import { useEffect, useRef } from 'react'
import { useLocation, useSearch } from 'wouter'
import { paths } from '@/app/paths'
import { tryDemoFor } from '@/app/tryDemo'
import { needsReload } from '@/stores/projectSession'
import { useProjectsStore } from '@/stores/projects'
import { queueStart } from '@/stores/projectStart'

/**
 * `/app/try` (F-HOME-04): opens the "Sample: Global Sales" project (made the first time), loads the
 * 1M-row sample and asks the demo question. `?sample=company-finances` does the same with the
 * finance sample (D117).
 */
export function TryRoute() {
  const [, navigate] = useLocation()
  const search = useSearch()
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const demo = tryDemoFor(new URLSearchParams(search).get('sample'))
      const store = useProjectsStore.getState()
      await store.hydrate()
      const project =
        useProjectsStore.getState().projects.find((p) => p.id === demo.projectId) ??
        store.create(demo.projectName, demo.projectId)
      await queueStart(
        project.id,
        { kind: 'try', sampleId: demo.sampleId },
        { persist: needsReload(project.id) },
      )
      navigate(paths.project(project.id), { replace: true })
    })()
  }, [navigate, search])
  return null
}
