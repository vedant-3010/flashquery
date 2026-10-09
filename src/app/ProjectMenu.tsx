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
import { useProjectsStore } from '@/stores/projects'

const MAX_LISTED = 8

/** The open project's name in the top bar (F-HOME-02): switch, rename, all projects, new. */
export function ProjectMenu() {
  const [, navigate] = useLocation()
  const openId = useProjectsStore((state) => state.openId)
  const projects = useProjectsStore((state) => state.projects)
  const [renaming, setRenaming] = useState(false)
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
            className="max-w-36 min-w-0 shrink lg:max-w-48"
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
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil aria-hidden />
            Rename…
          </DropdownMenuItem>
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
      <RenameProjectDialog project={project} open={renaming} onOpenChange={setRenaming} />
    </>
  )
}
