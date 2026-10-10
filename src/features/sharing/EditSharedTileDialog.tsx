import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { DashboardTile } from '@/dashboard/schema'

/** What an editor may change in a tile (F-SHARE-06): its title, and a text tile's text. */
export function EditSharedTileDialog({
  tile,
  onClose,
  onSave,
}: {
  tile: DashboardTile
  onClose: () => void
  onSave: (change: { title: string; text: string | null }) => void
}) {
  const [title, setTitle] = useState(tile.title)
  const [text, setText] = useState(tile.text ?? '')
  const titleId = useId()
  const textId = useId()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSave({ title: title.trim(), text: tile.type === 'text' ? text : tile.text })
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit tile</DialogTitle>
            <DialogDescription>
              {tile.type === 'text'
                ? 'Change its title and text.'
                : 'Change its title. Its results stay as the owner shared them.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={titleId}>Title</Label>
            <Input
              id={titleId}
              value={title}
              maxLength={200}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          {tile.type === 'text' && (
            <div className="grid gap-1.5">
              <Label htmlFor={textId}>Text (Markdown)</Label>
              <Textarea
                id={textId}
                value={text}
                maxLength={20_000}
                rows={8}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Done
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
