import { LoaderCircle, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { isTryProject } from '@/app/tryDemo'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { FormError } from '@/features/account/FormError'
import { useAuthAction } from '@/features/account/useAuthAction'
import { passphraseProblem } from '@/features/sync/passphrase'
import { PassphraseFields } from '@/features/sync/PassphraseFields'
import { RecoveryKeyPanel } from '@/features/sync/RecoveryKeyPanel'
import { useProjectsStore } from '@/stores/projects'
import { useSyncStore } from '@/stores/sync'

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/**
 * "Save your workspace to your account" (F-SYNC-01): what will be saved and what we can see, a
 * passphrase, then the recovery key, shown once. Saving starts when it's closed.
 */
export function VaultSetupDialog() {
  const open = useSyncStore((state) => state.dialog === 'setup')
  const close = useSyncStore((state) => state.closeDialog)
  const setUp = useSyncStore((state) => state.setUp)
  const finishSetUp = useSyncStore((state) => state.finishSetUp)
  const projects = useProjectsStore((state) => state.projects)
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { pending, error, run } = useAuthAction()

  const summary = useMemo(() => {
    const synced = projects.filter((p) => !p.localOnly && !isTryProject(p.id))
    return {
      projects: synced.length,
      questions: synced.reduce((sum, p) => sum + p.questions, 0),
      dashboards: synced.reduce((sum, p) => sum + p.dashboards, 0),
      files: synced.reduce((sum, p) => sum + p.datasets.length, 0),
    }
  }, [projects])

  const reset = () => {
    setPassphrase('')
    setConfirm('')
    setRecoveryKey(null)
    setSaved(false)
  }
  /** Saving starts; the dialog stays until this device is linked (a reload then loses nothing). */
  const finish = () =>
    run(finishSetUp).then(() => {
      reset()
      close()
    })
  const problem = passphraseProblem(passphrase, confirm)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return
        // The vault exists once the key is shown: closing starts saving all the same.
        if (recoveryKey) return void finish()
        reset()
        close()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {recoveryKey === null ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (problem) return
              void run(() => setUp(passphrase, remember)).then((key) => {
                if (key) setRecoveryKey(key)
              })
            }}
          >
            <DialogHeader>
              <DialogTitle>Save your workspace to your account</DialogTitle>
              <DialogDescription>
                Open your projects on any device you sign in to. Everything is encrypted on this
                device first, with a key only your passphrase opens: we store data we can’t read.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">What will be saved</p>
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                <li>
                  {count(summary.projects, 'project')}, with {count(summary.questions, 'question')}{' '}
                  and {count(summary.dashboards, 'dashboard')}
                </li>
                <li>{count(summary.files, 'file')} you loaded, and notes</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                We can see only sizes, dates and how many things you saved, never their names,
                questions or rows. Projects you mark “Keep on this device only” stay here. The AI
                still sees only column names and types.
              </p>
            </div>
            <PassphraseFields
              id="vault-setup"
              label="Choose a passphrase"
              passphrase={passphrase}
              confirm={confirm}
              onPassphrase={setPassphrase}
              onConfirm={setConfirm}
            />
            <div className="flex items-start gap-2">
              <Checkbox
                id="vault-setup-remember"
                checked={remember}
                onCheckedChange={(checked) => setRemember(checked === true)}
              />
              <div className="grid gap-1">
                <Label htmlFor="vault-setup-remember">Remember on this device</Label>
                <p className="text-xs text-muted-foreground">
                  Keeps the unlocked key in this browser (it can’t be copied out), so you don’t type
                  the passphrase each visit. Leave off on shared computers.
                </p>
              </div>
            </div>
            <FormError error={error} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Not now
              </Button>
              <Button type="submit" disabled={pending || problem !== null}>
                {pending ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Lock aria-hidden />
                )}
                Encrypt and continue
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Save your recovery key</DialogTitle>
              <DialogDescription>
                If you forget your passphrase, this key is the only way to open your workspace. We
                don’t keep a copy, so we can’t help you get it back.
              </DialogDescription>
            </DialogHeader>
            <RecoveryKeyPanel recoveryKey={recoveryKey} />
            <div className="flex items-start gap-2">
              <Checkbox
                id="vault-setup-saved"
                checked={saved}
                onCheckedChange={(checked) => setSaved(checked === true)}
              />
              <Label htmlFor="vault-setup-saved" className="font-normal">
                I’ve saved my recovery key somewhere safe
              </Label>
            </div>
            <FormError error={error} />
            <DialogFooter>
              <Button disabled={!saved || pending} onClick={() => void finish()}>
                {pending && (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                )}
                Start saving
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
