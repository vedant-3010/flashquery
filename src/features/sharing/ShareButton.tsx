import { Share2, Users } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { loginPath } from '@/app/paths'
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
import type { Dashboard } from '@/dashboard/schema'
import { ConsentDialog } from '@/features/sharing/ConsentDialog'
import { ShareDialog } from '@/features/sharing/ShareDialog'
import { toAppError, type AppErrorData } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { refreshAll } from '@/stores/dashboardJobs'
import { forgetSharedCopy, publishDashboard, sharing, unpublishDashboard } from '@/stores/sharing'
import { useToastStore } from '@/stores/toast'

type Step = 'closed' | 'consent' | 'manage' | 'conflict' | 'gone'

/**
 * Share (F-SHARE-01…07): the consent dialog before the first upload, then the share dialog. With
 * accounts off it isn't there; guests are asked to sign in first.
 */
export function ShareButton({ dashboard }: { dashboard: Dashboard }) {
  const status = useAuthStore((state) => state.status)
  const toast = useToastStore((state) => state.show)
  const [location, navigate] = useLocation()
  const [step, setStep] = useState<Step>('closed')
  const [mode, setMode] = useState<'share' | 'update'>('share')
  const [pending, setPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)

  if (status === 'off') return null
  const shared = dashboard.cloud !== undefined

  const start = () => {
    if (status !== 'signed-in') {
      navigate(loginPath(location))
      return
    }
    setError(null)
    setMode('share')
    setStep(dashboard.cloud ? 'manage' : 'consent')
    const cloudId = dashboard.cloud?.id
    if (!cloudId) return
    // Deleted from another device (or another account's): say so rather than failing piecemeal. If
    // the check itself fails, the dialog's sections show that error.
    void sharing()
      .then((api) => api.dashboardExists(cloudId))
      .then(
        (exists) => !exists && setStep((s) => (s === 'manage' ? 'gone' : s)),
        () => undefined,
      )
  }

  /** After consent: nothing is sent before this (F-SHARE-02). */
  const upload = async (force = false) => {
    setPending(true)
    setError(null)
    try {
      await publishDashboard(dashboard.id, { force })
      toast(mode === 'share' ? `Shared ${dashboard.name}.` : 'Updated the shared copy.')
      setStep('manage')
    } catch (cause) {
      const failure = toAppError(cause)
      if (failure.code === 'share_conflict') setStep('conflict')
      else if (failure.code === 'share_gone') setStep('gone')
      else setError(failure)
    } finally {
      setPending(false)
    }
  }

  /** "Update shared copy" (F-SHARE-07): re-run the tiles here, then consent to the new results. */
  const update = async () => {
    setRefreshing(true)
    try {
      await refreshAll(dashboard.id)
    } finally {
      setRefreshing(false)
    }
    setError(null)
    setMode('update')
    setStep('consent')
  }

  return (
    <>
      <Button size="sm" variant={shared ? 'secondary' : 'outline'} onClick={start}>
        {shared ? <Users aria-hidden /> : <Share2 aria-hidden />}
        {shared ? 'Shared' : 'Share'}
      </Button>

      <ConsentDialog
        dashboard={dashboard}
        mode={mode}
        open={step === 'consent'}
        onOpenChange={(open) => !open && setStep(mode === 'update' ? 'manage' : 'closed')}
        onConfirm={() => void upload()}
        pending={pending}
        error={error}
      />

      {dashboard.cloud && (
        <ShareDialog
          open={step === 'manage'}
          onOpenChange={(open) => setStep(open ? 'manage' : 'closed')}
          cloudId={dashboard.cloud.id}
          name={dashboard.name}
          savedAt={dashboard.cloud.savedAt}
          onUpdate={() => void update()}
          updating={refreshing}
          onStop={async () => {
            await unpublishDashboard(dashboard.id)
            toast(`Stopped sharing ${dashboard.name}.`)
          }}
        />
      )}

      {/* Closing follows the button's own choice (an Action's click runs first). */}
      <AlertDialog
        open={step === 'conflict'}
        onOpenChange={(open) => !open && setStep((s) => (s === 'conflict' ? 'manage' : s))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Someone edited the shared copy</AlertDialogTitle>
            <AlertDialogDescription>
              Since you last updated it from here, its layout, titles or text were changed in the
              shared copy (by an editor, or by you there). Updating replaces those changes with this
              dashboard as it is here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void upload(true)}>
              Replace their changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={step === 'gone'}
        onOpenChange={(open) => !open && setStep((s) => (s === 'gone' ? 'closed' : s))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>The shared copy is gone</AlertDialogTitle>
            <AlertDialogDescription>
              It was deleted (perhaps from another device), or it belongs to another account. Share
              this dashboard again to make a new copy; the old links and invites won’t come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                forgetSharedCopy(dashboard.id)
                setMode('share')
                setStep('consent')
              }}
            >
              Share again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
