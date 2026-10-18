import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormError } from '@/features/account/FormError'
import { useAuthAction } from '@/features/account/useAuthAction'
import { passphraseProblem } from '@/features/sync/passphrase'
import { PassphraseFields } from '@/features/sync/PassphraseFields'
import { RecoveryKeyPanel } from '@/features/sync/RecoveryKeyPanel'
import { useSyncStore } from '@/stores/sync'
import { useToastStore } from '@/stores/toast'

function CurrentPassphrase({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Current passphrase</Label>
      <Input
        id={id}
        type="password"
        autoComplete="current-password"
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** A new passphrase (F-SYNC-05): the same key, wrapped again; nothing is re-encrypted. */
export function ChangePassphraseForm({ onDone }: { onDone: () => void }) {
  const changePassphrase = useSyncStore((state) => state.changePassphrase)
  const toast = useToastStore((state) => state.show)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const { pending, error, run } = useAuthAction()
  const problem = current ? passphraseProblem(next, confirm) : 'Enter your current passphrase.'

  return (
    <form
      aria-label="Change passphrase"
      className="grid gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (problem) return
        void run(() => changePassphrase(current, next).then(() => true)).then((done) => {
          if (!done) return
          toast('Passphrase changed. Other devices that remember it stay unlocked.')
          onDone()
        })
      }}
    >
      <CurrentPassphrase id="vault-change-current" value={current} onChange={setCurrent} />
      <PassphraseFields
        id="vault-change"
        label="New passphrase"
        passphrase={next}
        confirm={confirm}
        onPassphrase={setNext}
        onConfirm={setConfirm}
      />
      <FormError error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || problem !== null}>
          Change passphrase
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** A new recovery key (F-SYNC-05): the old one stops working. */
export function NewRecoveryKeyForm({ onDone }: { onDone: () => void }) {
  const newRecoveryKey = useSyncStore((state) => state.newRecoveryKey)
  const [current, setCurrent] = useState('')
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const { pending, error, run } = useAuthAction()

  if (recoveryKey) {
    return (
      <div className="grid gap-3 rounded-lg border p-3">
        <p>Your new recovery key. The old one no longer works. We don’t keep a copy.</p>
        <RecoveryKeyPanel recoveryKey={recoveryKey} />
        <Button size="sm" className="w-fit" onClick={onDone}>
          I’ve saved it
        </Button>
      </div>
    )
  }
  return (
    <form
      aria-label="New recovery key"
      className="grid gap-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!current) return
        void run(() => newRecoveryKey(current)).then((key) => {
          if (key) setRecoveryKey(key)
        })
      }}
    >
      <CurrentPassphrase id="vault-recovery-current" value={current} onChange={setCurrent} />
      <FormError error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !current}>
          Make a new recovery key
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
