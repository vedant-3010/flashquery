import { LogOut, Trash2 } from 'lucide-react'
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
import { useToastStore } from '@/stores/toast'

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
  const [confirming, setConfirming] = useState(false)
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
        <Button variant="destructive" disabled={pending} onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden />
          Delete account…
        </Button>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes your account and every dashboard you saved or shared in the cloud, at
              once. Your projects in this browser stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void run(async () => {
                  await useAuthStore.getState().deleteAccount()
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
