import { CloudUpload, ExternalLink, LoaderCircle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { appUrl, paths } from '@/app/paths'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { FormError } from '@/features/account/FormError'
import { LinksSection } from '@/features/sharing/LinksSection'
import { PeopleSection } from '@/features/sharing/PeopleSection'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { formatAgo } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

/**
 * A shared dashboard, for its owner (F-SHARE-03/04/07): people, view-only links, updating the
 * shared copy from this device (when the dashboard is here) and stopping sharing.
 */
export function ShareDialog({
  open,
  onOpenChange,
  cloudId,
  name,
  savedAt,
  onUpdate,
  updating = false,
  onStop,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cloudId: string
  name: string
  /** When this device last uploaded it. */
  savedAt?: number
  /** "Update shared copy": absent where the dashboard isn't on this device. */
  onUpdate?: () => void
  updating?: boolean
  onStop: () => Promise<void>
}) {
  const locale = useSettingsStore((state) => state.locale)
  const [confirmStop, setConfirmStop] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)

  const close = (next: boolean) => {
    if (!next) {
      setConfirmStop(false)
      setError(null)
    }
    onOpenChange(next)
  }

  const stop = async () => {
    setStopping(true)
    setError(null)
    try {
      await onStop()
      close(false)
    } catch (cause) {
      setError(toAppError(cause))
    } finally {
      setStopping(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share “{name}”</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {savedAt
                ? `Shared copy uploaded ${formatAgo(savedAt, locale)}.`
                : 'Its shared copy holds the results you uploaded.'}{' '}
              Your files stay on your device.
            </span>
            <a
              href={appUrl(paths.shared(cloudId))}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              Open shared copy
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </DialogDescription>
        </DialogHeader>

        <PeopleSection cloudId={cloudId} />
        <Separator />
        <LinksSection cloudId={cloudId} />

        <FormError error={error} />
        {confirmStop ? (
          <div
            role="group"
            aria-label="Stop sharing"
            className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
          >
            <p>
              Stop sharing? The shared copy, its people and its links are deleted: anyone opening a
              link sees that it’s no longer shared.
              {onUpdate && ' The dashboard stays on this device.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={stopping} onClick={() => setConfirmStop(false)}>
                Keep sharing
              </Button>
              <Button variant="destructive" disabled={stopping} onClick={() => void stop()}>
                {stopping && (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                )}
                Stop sharing
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmStop(true)}
            >
              <Trash2 aria-hidden />
              Stop sharing…
            </Button>
            {onUpdate && (
              <Button disabled={updating} onClick={onUpdate}>
                {updating ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <CloudUpload aria-hidden />
                )}
                {updating ? 'Refreshing tiles…' : 'Update shared copy'}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
