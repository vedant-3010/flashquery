import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MAX_NAME_LENGTH, useProjectsStore, type Project } from '@/stores/projects'

/** Renames a project (Home's cards and the top bar's project menu). */
export function RenameProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Pick<Project, 'id' | 'name'>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const rename = useProjectsStore((state) => state.rename)
  const [name, setName] = useState(project.name)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(project.name)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            rename(project.id, name)
            onOpenChange(false)
          }}
        >
          <Input
            aria-label="Project name"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
