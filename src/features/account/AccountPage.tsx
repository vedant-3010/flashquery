import { Eraser, LogOut, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Redirect, useLocation } from 'wouter'
import { paths } from '@/app/paths'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AccountsOff } from '@/features/account/AccountsOff'
import { CenteredLayout } from '@/features/account/CenteredLayout'
import { FormError } from '@/features/account/FormError'
import { useAuthAction } from '@/features/account/useAuthAction'
import type { Account } from '@/platform/auth'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'
import { useToastStore } from '@/stores/toast'
import { clearLocalData } from '@/stores/workspace'

const PROVIDERS: Record<string, string> = {
  email: 'your email',
  google: 'Google',
  github: 'GitHub',
}

/** `/app/account` (F-ACCT-03): the display name, how they sign in, sign out, delete the account. */
export function AccountPage() {
  const status = useAuthStore((state) => state.status)
  const account = useAuthStore((state) => state.account)
  if (status === 'off') return <AccountsOff />
  if (status === 'guest') return <Redirect to={paths.login} replace />
  // Still checking the saved session: the form waits for the account, so its name starts filled.
  return account ? <AccountDetails key={account.id} account={account} /> : null
}

function AccountDetails({ account }: { account: Account }) {
  const [, navigate] = useLocation()
  const [name, setName] = useState(account.name)
  const [confirming, setConfirming] = useState<'delete' | 'clear' | null>(null)
  const { pending, error, run } = useAuthAction()
  const toast = useToastStore((state) => state.show)

  const leave = (message: string) => {
    toast(message)
    navigate(paths.home, { replace: true })
  }

  return (
    <CenteredLayout
      title="Your account"
      description={account.email}
      footer={
        <p>
          <Link href={paths.home} className="hover:underline">
            Back to your projects
          </Link>
        </p>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await useAuthStore.getState().rename(name)
            return true
          }).then((done) => {
            if (done) toast('Name saved.')
          })
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="account-name">Display name</Label>
          <div className="flex gap-2">
            <Input
              id="account-name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={pending || !name.trim() || name.trim() === account.name}
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shown to people you share dashboards with. You sign in with{' '}
            {PROVIDERS[account.provider] ?? account.provider}.
          </p>
        </div>
      </form>
      <FormError error={error} />
      {error?.code === 'subscription_active' && (
        <Link
          href={paths.billing}
          className="w-fit text-sm text-primary underline-offset-4 hover:underline"
        >
          Open Plan and billing
        </Link>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            void run(async () => {
              await useAuthStore.getState().signOut()
              return true
            }).then((done) => {
              if (done) leave('Signed out.')
            })
          }
        >
          <LogOut aria-hidden />
          Sign out
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setConfirming('clear')}>
          <Eraser aria-hidden />
          Sign out and clear this browser…
        </Button>
        <Button variant="destructive" disabled={pending} onClick={() => setConfirming('delete')}>
          <Trash2 aria-hidden />
          Delete account…
        </Button>
      </div>
      <AlertDialog
        open={confirming === 'clear'}
        onOpenChange={(open) => setConfirming(open ? 'clear' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out and clear this browser?</AlertDialogTitle>
            <AlertDialogDescription>
              For a shared or borrowed computer. Your projects, files, settings and any saved AI key
              are removed from this browser. Projects saved to your account come back when you sign
              in and unlock; ones kept on this device only are gone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void run(async () => {
                  // Changes still waiting to be saved go to the account first.
                  await useSyncStore.getState().retry()
                  await useAuthStore.getState().signOut()
                  await clearLocalData()
                })
              }
            >
              Sign out and clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirming === 'delete'}
        onOpenChange={(open) => setConfirming(open ? 'delete' : null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes your account, your encrypted workspace and every dashboard you shared, at
              once. Your projects in this browser stay. On a paid plan? Cancel it first in Plan and
              billing: an account with a plan still charging can’t be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void run(async () => {
                  await useAuthStore.getState().deleteAccount()
                  await useSyncStore.getState().accountDeleted()
                  return true
                }).then((done) => {
                  if (done) leave('Your account was deleted.')
                })
              }
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CenteredLayout>
  )
}
