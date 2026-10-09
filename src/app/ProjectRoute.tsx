import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Redirect, useLocation, useParams } from 'wouter'
import { AppShell } from '@/app/AppShell'
import { MessagePage } from '@/app/MessagePage'
import { appUrl, paths, viewFromSegment } from '@/app/paths'
import { openProject, runPendingStart, type OpenOutcome } from '@/stores/projectSession'
import { useProjectsStore } from '@/stores/projects'
import { useUiStore } from '@/stores/ui'

/**
 * `/app/p/:id` (workspace), `/sql` and `/dashboard` (F-HOME-01): opens the project, then shows the
 * shell. The view and the URL follow each other, so views deep-link and Back switches them.
 */
export function ProjectRoute() {
  const { id = '', view: segment } = useParams<{ id: string; view?: string }>()
  const view = viewFromSegment(segment)
  const [, navigate] = useLocation()
  const [opened, setOpened] = useState<{ id: string; outcome: OpenOutcome } | null>(null)
  const name = useProjectsStore((state) => state.projects.find((p) => p.id === id)?.name)

  useEffect(() => {
    let live = true
    void openProject(id).then((outcome) => {
      if (outcome === 'open') void runPendingStart(id)
      if (live) setOpened({ id, outcome })
    })
    return () => {
      live = false
    }
  }, [id])

  // URL → view (links, Back and Forward).
  useEffect(() => {
    if (view !== null && useUiStore.getState().view !== view) useUiStore.getState().setView(view)
  }, [view])

  // View → URL (the tabs, the command palette, pinning…).
  useEffect(
    () =>
      useUiStore.subscribe((state, previous) => {
        if (state.view === previous.view) return
        const target = paths.project(id, state.view)
        if (window.location.pathname !== appUrl(target)) navigate(target)
      }),
    [id, navigate],
  )

  useEffect(() => {
    if (!name) return
    document.title = `${name} · flashQuery`
    return () => {
      document.title = 'flashQuery'
    }
  }, [name])

  if (view === null) return <Redirect to={paths.project(id)} replace />
  const outcome = opened?.id === id ? opened.outcome : null
  if (outcome === 'missing') {
    return (
      <MessagePage
        title="Project not found"
        description="It may have been deleted. Projects are saved in the browser that made them, so a link from another browser won't open here."
      />
    )
  }
  if (outcome !== 'open') {
    return (
      <div
        className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground"
        aria-busy="true"
      >
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        Opening project…
      </div>
    )
  }
  return <AppShell />
}
