import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { appUrl, paths } from '@/app/paths'
import { IconButton } from '@/components/IconButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RenameProjectDialog } from '@/features/home/RenameProjectDialog'
import { formatAgo } from '@/lib/format'
import { useProjectsStore, type Project } from '@/stores/projects'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/** A project on Home (F-HOME-03): its data, dashboards and questions; open, rename, delete. */
export function ProjectCard({ project }: { project: Project }) {
  const locale = useSettingsStore((state) => state.locale)
  const remove = useProjectsStore((state) => state.remove)
  const toast = useToastStore((state) => state.show)
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const shown = project.datasets.slice(0, 3)
  const more = project.datasets.length - shown.length

  const confirmDelete = async () => {
    const open = useProjectsStore.getState().openId === project.id
    await remove(project.id)
    // The deleted project's data is still loaded in this page: start fresh.
    if (open) window.location.assign(appUrl(paths.home))
    else toast(`Deleted ${project.name}.`)
  }

  return (
    <article
      aria-label={project.name}
      className="relative grid gap-2 rounded-2xl border bg-card p-4 transition-[border-color,box-shadow,translate] duration-200 focus-within:ring-2 focus-within:ring-ring/50 hover:-translate-y-px hover:border-foreground/20 hover:shadow-sm"
    >
      <div className="flex items-start gap-2">
        {/* The link covers the card; the menu sits above it. */}
        <Link
          href={paths.project(project.id)}
          className="min-w-0 flex-1 truncate font-medium outline-none after:absolute after:inset-0 after:rounded-2xl"
        >
          {project.name}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              label={`More actions for ${project.name}`}
              size="icon-xs"
              className="relative z-10 -my-1"
            >
              <EllipsisVertical />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto">
            <DropdownMenuItem onSelect={() => setDialog('rename')}>
              <Pencil aria-hidden />
              Rename…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
              <Trash2 aria-hidden />
              Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Its data, as chips: what's in it at a glance. */}
      {shown.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap gap-1" aria-label="Data">
          {shown.map((name) => (
            <li
              key={name}
              className="max-w-full truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              title={name}
            >
              {name}
            </li>
          ))}
          {more > 0 && <li className="px-1 py-0.5 text-xs text-muted-foreground">+{more}</li>}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No data yet</p>
      )}
      <p className="text-xs text-muted-foreground">
        {count(project.dashboards, 'dashboard')} · {count(project.questions, 'question')} · opened{' '}
        {formatAgo(project.lastOpenedAt, locale)}
      </p>

      <RenameProjectDialog
        project={project}
        open={dialog === 'rename'}
        onOpenChange={(open) => setDialog(open ? 'rename' : null)}
      />

      <AlertDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its history, dashboards, notes and kept files are deleted from this browser. Export
              its workspace first (Settings, inside the project) to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
