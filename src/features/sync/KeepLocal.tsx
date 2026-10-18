import { Cloud, HardDrive } from 'lucide-react'
import { isTryProject } from '@/app/tryDemo'
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useProjectsStore, type Project } from '@/stores/projects'
import { useSyncLinked } from '@/features/sync/useSyncLinked'
import { useToastStore } from '@/stores/toast'

/**
 * The project menu's "Keep on this device only" (F-SYNC-06), or "Save to your account" for a
 * project kept here. `onKeepLocal` opens KeepLocalDialog (its copy in the account is deleted).
 */
export function KeepLocalMenuItem({
  project,
  onKeepLocal,
}: {
  project: Project
  onKeepLocal: () => void
}) {
  const linked = useSyncLinked()
  const setLocalOnly = useProjectsStore((state) => state.setLocalOnly)
  const toast = useToastStore((state) => state.show)
  if (!linked || isTryProject(project.id)) return null
  return project.localOnly ? (
    <DropdownMenuItem
      onSelect={() => {
        setLocalOnly(project.id, false)
        toast(`Saving ${project.name} to your account, encrypted.`)
      }}
    >
      <Cloud aria-hidden />
      Save to your account
    </DropdownMenuItem>
  ) : (
    <DropdownMenuItem onSelect={onKeepLocal}>
      <HardDrive aria-hidden />
      Keep on this device only…
    </DropdownMenuItem>
  )
}

export function KeepLocalDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Pick<Project, 'id' | 'name'>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setLocalOnly = useProjectsStore((state) => state.setLocalOnly)
  const toast = useToastStore((state) => state.show)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keep {project.name} on this device only?</AlertDialogTitle>
          <AlertDialogDescription>
            Its copy in your account is deleted, with its files. Other devices keep what they have
            but stop saving it. You can save it to your account again any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setLocalOnly(project.id, true)
              toast(`${project.name} is kept on this device only.`)
            }}
          >
            Keep on this device
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Where a project is kept, on Home's cards (only once this browser saves to an account). */
export function ProjectPlace({ project }: { project: Project }) {
  const linked = useSyncLinked()
  if (!linked) return null
  const here = project.localOnly || isTryProject(project.id)
  return (
    <span
      className="inline-flex items-center gap-1"
      title={here ? 'Kept on this device only' : 'Saved to your account, encrypted'}
    >
      {here ? (
        <HardDrive className="size-3" aria-hidden />
      ) : (
        <Cloud className="size-3" aria-hidden />
      )}
      {here ? 'This device' : 'Account'}
    </span>
  )
}
