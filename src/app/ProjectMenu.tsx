import { ChevronDown, FolderOpen, House, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RenameProjectDialog } from '@/features/home/RenameProjectDialog'
import { KeepLocalDialog, KeepLocalMenuItem } from '@/features/sync/KeepLocal'
import { useProjectsStore } from '@/stores/projects'

const MAX_LISTED = 8

/** The open project's name in the top bar (F-HOME-02): switch, rename, all projects, new. */
export function ProjectMenu() {
  const [, navigate] = useLocation()
  const openId = useProjectsStore((state) => state.openId)
  const projects = useProjectsStore((state) => state.projects)
  const [dialog, setDialog] = useState<'rename' | 'local' | null>(null)
  const project = projects.find((p) => p.id === openId)
  const others = useMemo(
    () =>
      projects
        .filter((p) => p.id !== openId)
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
        .slice(0, MAX_LISTED),
    [projects, openId],
  )
  if (!project) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Project: ${project.name}`}
            // On phones the name takes the room the bar has left; wider, it stays compact.
            className="min-w-14 shrink justify-start max-md:flex-1 md:max-w-36 lg:max-w-48"
          >
            <span className="truncate">{project.name}</span>
            <ChevronDown aria-hidden className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto max-w-72">
          {others.length > 0 && (
            <>
              <DropdownMenuLabel>Switch project</DropdownMenuLabel>
              {others.map((other) => (
                <DropdownMenuItem key={other.id} onSelect={() => navigate(paths.project(other.id))}>
                  <FolderOpen aria-hidden />
                  <span className="truncate">{other.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setDialog('rename')}>
            <Pencil aria-hidden />
            Rename…
          </DropdownMenuItem>
          <KeepLocalMenuItem project={project} onKeepLocal={() => setDialog('local')} />
          <DropdownMenuItem onSelect={() => navigate(paths.newProject)}>
            <Plus aria-hidden />
            New project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(paths.home)}>
            <House aria-hidden />
            All projects
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameProjectDialog
        project={project}
        open={dialog === 'rename'}
        onOpenChange={(open) => setDialog(open ? 'rename' : null)}
      />
      <KeepLocalDialog
        project={project}
        open={dialog === 'local'}
        onOpenChange={(open) => setDialog(open ? 'local' : null)}
      />
    </>
  )
}
