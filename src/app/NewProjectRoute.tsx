import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { useProjectsStore } from '@/stores/projects'

/** `/app/new`: creates an empty project and opens it (Home's "New project", e2e). */
export function NewProjectRoute() {
  const [, navigate] = useLocation()
  // Strict mode runs effects twice in development: create one project, not two.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void useProjectsStore
      .getState()
      .hydrate()
      .then(() => {
        const project = useProjectsStore.getState().create()
        navigate(paths.project(project.id), { replace: true })
      })
  }, [navigate])
  return null
}
