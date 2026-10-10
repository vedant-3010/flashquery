import { Plus } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link } from 'wouter'
import { paths } from '@/app/paths'
import { Toaster } from '@/components/Toaster'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HowItWorksDialog } from '@/features/ask/HowItWorksDialog'
import { FirstVisit } from '@/features/home/FirstVisit'
import { HomeHeader } from '@/features/home/HomeHeader'
import { ProjectCard } from '@/features/home/ProjectCard'
import { QuickAsk } from '@/features/home/QuickAsk'
import { RecentQuestions } from '@/features/home/RecentQuestions'
import { SharedSection } from '@/features/home/SharedSection'
import { StartOptions } from '@/features/home/StartOptions'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { greeting } from '@/lib/greeting'
import { useAuthStore } from '@/stores/auth'
import { useProjectsStore } from '@/stores/projects'

/**
 * Home at /app/ (F-HOME-03): a greeting, a quick ask, ways to start, the projects, dashboards
 * shared with you (F-SHARE-05) and recent questions; a first-visit welcome before any project
 * exists.
 */
export function HomePage() {
  const hydrated = useProjectsStore((state) => state.hydrated)
  const projects = useProjectsStore((state) => state.projects)
  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [projects],
  )
  const latest = sorted[0]
  const firstName = useAuthStore((state) => state.account?.name.trim().split(/\s+/)[0] ?? '')

  useEffect(() => {
    document.title = 'flashQuery'
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <HomeHeader />
      <main className="mx-auto grid w-full max-w-5xl content-start gap-10 px-4 py-8 sm:px-6">
        {!hydrated ? (
          <Skeleton className="h-40" />
        ) : !latest ? (
          <>
            <FirstVisit />
            <SharedSection />
          </>
        ) : (
          <>
            <section aria-labelledby="home-greeting" className="grid gap-4">
              <div className="grid gap-1">
                {/* The landing's serif voice, the one touch of it in the app (D118). */}
                <h1
                  id="home-greeting"
                  className="font-serif text-[34px] leading-[1.05] tracking-[-0.01em] italic"
                >
                  {greeting()}
                  {firstName && `, ${firstName}`}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Pick up where you left off, or start something new. Everything here stays in this
                  browser.
                </p>
              </div>
              <QuickAsk project={latest} />
            </section>
            <section aria-labelledby="home-projects" className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 id="home-projects" className="flex items-baseline gap-1.5 text-sm font-medium">
                  Projects
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {sorted.length}
                  </span>
                </h2>
                <Button asChild variant="outline" size="sm">
                  <Link href={paths.newProject}>
                    <Plus aria-hidden />
                    New project
                  </Link>
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sorted.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            </section>
            <SharedSection />
            <StartOptions variant="tiles" />
            <RecentQuestions projects={sorted} />
          </>
        )}
      </main>
      <SettingsDialog inProject={false} />
      <HowItWorksDialog inspector={false} />
      <Toaster />
    </div>
  )
}
