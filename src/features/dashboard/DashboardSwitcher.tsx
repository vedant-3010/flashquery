import { Check, ChevronDown, LayoutDashboard, Pencil, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dashboard } from '@/dashboard/schema'
import { useDashboardStore } from '@/stores/dashboard'

/** Several dashboards (F-DASH-05): switch, create, rename, delete. */
export function DashboardSwitcher({ dashboard }: { dashboard: Dashboard }) {
  const { dashboards, setActive, createDashboard, renameDashboard, deleteDashboard } =
    useDashboardStore()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const [name, setName] = useState(dashboard.name)
  const nameId = useId()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Dashboard: ${dashboard.name}`}>
            <LayoutDashboard aria-hidden />
            <span className="max-w-48 truncate">{dashboard.name}</span>
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Dashboards</DropdownMenuLabel>
          {dashboards.map((d) => (
            <DropdownMenuItem key={d.id} onSelect={() => setActive(d.id)}>
              <Check className={d.id === dashboard.id ? '' : 'invisible'} aria-hidden />
              <span className="truncate">{d.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{d.tiles.length}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => createDashboard()}>
            <Plus aria-hidden />
            New dashboard
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setName(dashboard.name)
              setDialog('rename')
            }}
          >
            <Pencil aria-hidden />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2 aria-hidden />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'rename'} onOpenChange={(open) => setDialog(open ? 'rename' : null)}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              renameDashboard(dashboard.id, name)
              setDialog(null)
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename dashboard</DialogTitle>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                id={nameId}
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!name.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {dashboard.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {dashboard.tiles.length} {dashboard.tiles.length === 1 ? 'tile is' : 'tiles are'}{' '}
              removed from this device. Export it first to keep a copy.
              {dashboard.cloud &&
                ' Its shared copy stays shared: stop sharing it first, or later from Home.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteDashboard(dashboard.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
