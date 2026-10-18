import { LoaderCircle, LockOpen } from 'lucide-react'
import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError } from '@/features/account/FormError'
import { useAuthAction } from '@/features/account/useAuthAction'
import { passphraseProblem } from '@/features/sync/passphrase'
import { PassphraseFields } from '@/features/sync/PassphraseFields'
import { useSyncStore } from '@/stores/sync'

/**
 * "Unlock your workspace" on a device that doesn't have the key (F-SYNC-02): the passphrase, or
 * the recovery key and a new passphrase. "Not now" keeps working on this device, without syncing.
 */
export function VaultUnlockDialog() {
  const open = useSyncStore((state) => state.dialog === 'unlock')
  const linked = useSyncStore((state) => state.linked)
  const close = useSyncStore((state) => state.closeDialog)
  const unlock = useSyncStore((state) => state.unlock)
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase')
  const [passphrase, setPassphrase] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const { pending, error, run, setError } = useAuthAction()

  const reset = () => {
    setMode('passphrase')
    setPassphrase('')
    setRecoveryKey('')
    setNext('')
    setConfirm('')
    setError(null)
  }
  const problem =
    mode === 'passphrase'
      ? passphrase
        ? null
        : 'Enter your passphrase.'
      : recoveryKey.trim()
        ? passphraseProblem(next, confirm)
        : 'Enter your recovery key.'

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) return
        reset()
        close()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (problem) return
            const secret =
              mode === 'passphrase'
                ? { passphrase }
                : { recoveryKey: recoveryKey.trim(), newPassphrase: next }
            void run(() => unlock(secret, remember).then(() => true)).then((done) => {
              if (done) reset()
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>Unlock your workspace</DialogTitle>
            <DialogDescription>
              {mode === 'passphrase'
                ? 'Your projects are saved to your account, encrypted. Enter your passphrase to open them on this device.'
                : 'Your recovery key opens your workspace. Then choose a new passphrase: the old one stops working.'}
            </DialogDescription>
          </DialogHeader>

          {mode === 'passphrase' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="vault-unlock-passphrase">Passphrase</Label>
              <Input
                id="vault-unlock-passphrase"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto w-fit p-0 text-xs"
                onClick={() => {
                  setError(null)
                  setMode('recovery')
                }}
              >
                Forgot it? Use your recovery key
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="vault-unlock-recovery">Recovery key</Label>
                <Input
                  id="vault-unlock-recovery"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className="font-mono"
                  placeholder="XXXX-XXXX-…"
                  value={recoveryKey}
                  onChange={(event) => setRecoveryKey(event.target.value)}
                />
              </div>
              <PassphraseFields
                id="vault-recover"
                label="New passphrase"
                passphrase={next}
                confirm={confirm}
                onPassphrase={setNext}
                onConfirm={setConfirm}
              />
            </>
          )}

          <div className="flex items-start gap-2">
            <Checkbox
              id="vault-unlock-remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            <div className="grid gap-1">
              <Label htmlFor="vault-unlock-remember">Remember on this device</Label>
              <p className="text-xs text-muted-foreground">
                Leave off on shared computers: you’ll type the passphrase each visit.
              </p>
            </div>
          </div>
          {!linked && (
            <p className="text-xs text-muted-foreground">
              Projects already in this browser are saved to your account too, encrypted (except any
              you keep on this device only).
            </p>
          )}
          <FormError error={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset()
                close()
              }}
            >
              Not now
            </Button>
            <Button type="submit" disabled={pending || problem !== null}>
              {pending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <LockOpen aria-hidden />
              )}
              Unlock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
