import { CloudOff, KeyRound, Lock, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
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
import { FormError } from '@/features/account/FormError'
import { useAuthAction } from '@/features/account/useAuthAction'
import { ChangePassphraseForm, NewRecoveryKeyForm } from '@/features/sync/VaultKeyForms'
import { formatAgo, formatBytes, formatPercent } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'
import { useSyncStore } from '@/stores/sync'

/** Status and storage of the encrypted workspace (F-SYNC-05), in Settings. */
export function SyncSettings() {
  const sync = useSyncStore()
  const refreshUsage = useSyncStore((state) => state.refreshUsage)
  const locale = useSettingsStore((state) => state.locale)
  const [form, setForm] = useState<'passphrase' | 'recovery' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { pending, error, run } = useAuthAction()
  const unlocked = sync.status === 'ready' || sync.status === 'syncing' || sync.status === 'error'

  // The meter's figure from the service, each time Settings opens.
  useEffect(() => {
    if (unlocked) void refreshUsage()
  }, [unlocked, refreshUsage])

  if (sync.status === 'off' || sync.status === 'unavailable') return null

  return (
    <section aria-labelledby="settings-sync" className="grid gap-3 border-t pt-4">
      <h3 id="settings-sync" className="text-sm font-medium">
        Saved to your account
      </h3>
      {sync.status === 'checking' && <p className="text-xs text-muted-foreground">Checking…</p>}
      {sync.status === 'setup' && (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">
            Your projects are only in this browser. Save them to your account, encrypted, to open
            them on any device.
          </p>
          <Button size="sm" className="w-fit" onClick={() => sync.openDialog('setup')}>
            <Lock aria-hidden />
            Set up encrypted saving
          </Button>
        </div>
      )}
      {sync.status === 'locked' && (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">
            Locked on this device. Unlock with your passphrase to see and save your projects.
          </p>
          <Button size="sm" className="w-fit" onClick={() => sync.openDialog('unlock')}>
            Unlock
          </Button>
        </div>
      )}
      {sync.status === 'other-account' && (
        <p className="text-xs text-muted-foreground">
          This browser’s projects are saved to another account. Sign in with that account to keep
          them in step; this one’s projects aren’t saved here.
        </p>
      )}
      {unlocked && (
        <div className="grid gap-3 text-xs">
          <p role="status" className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                sync.status === 'error'
                  ? 'size-1.5 rounded-full bg-destructive'
                  : 'size-1.5 rounded-full bg-emerald-500'
              }
            />
            {sync.status === 'syncing'
              ? 'Saving…'
              : sync.status === 'error'
                ? (sync.error?.message ?? 'Couldn’t save to your account.')
                : sync.lastSyncedAt
                  ? `Encrypted and saved · ${formatAgo(sync.lastSyncedAt, locale)}`
                  : 'Encrypted and saved'}
            {sync.uploads > 0 &&
              ` · saving ${sync.uploads === 1 ? 'a file' : `${sync.uploads} files`}`}
            <Button
              size="xs"
              variant="ghost"
              className="ml-auto"
              disabled={sync.status === 'syncing'}
              onClick={() => void sync.retry()}
            >
              <RefreshCw aria-hidden />
              Sync now
            </Button>
          </p>
          {sync.usage && (
            <div className="grid gap-1">
              <div
                role="meter"
                aria-label="Storage used"
                aria-valuemin={0}
                aria-valuemax={sync.usage.limit}
                aria-valuenow={sync.usage.used}
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: `${Math.min(100, (sync.usage.used / sync.usage.limit) * 100)}%` }}
                />
              </div>
              <p className="text-muted-foreground">
                {formatBytes(sync.usage.used, locale)} of {formatBytes(sync.usage.limit, locale)}{' '}
                used ({formatPercent(sync.usage.used / sync.usage.limit, locale)})
              </p>
            </div>
          )}
          <p className="text-muted-foreground">
            Encrypted on this device before it’s saved: we see sizes and dates, never your files,
            questions or names. Projects you keep on this device only aren’t saved.
          </p>
          {form === 'passphrase' && <ChangePassphraseForm onDone={() => setForm(null)} />}
          {form === 'recovery' && <NewRecoveryKeyForm onDone={() => setForm(null)} />}
          {form === null && (
            <div className="flex flex-wrap gap-2">
              <Button size="xs" variant="outline" onClick={() => setForm('passphrase')}>
                <KeyRound aria-hidden />
                Change passphrase
              </Button>
              <Button size="xs" variant="outline" onClick={() => setForm('recovery')}>
                New recovery key
              </Button>
              <Button size="xs" variant="outline" onClick={() => void sync.lock()}>
                <Lock aria-hidden />
                Lock on this device
              </Button>
              <Button size="xs" variant="outline" onClick={() => setDeleting(true)}>
                <CloudOff aria-hidden />
                Delete cloud copy…
              </Button>
            </div>
          )}
          <FormError error={error} />
        </div>
      )}

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your saved workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              Your projects, questions, dashboards and files are deleted from your account. This
              browser keeps its copy; other devices keep theirs but stop saving. Dashboards you
              shared stay shared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => void run(sync.deleteCloudCopy)}
            >
              Delete cloud copy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
