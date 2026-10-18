import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MIN_PASSPHRASE } from '@/features/sync/passphrase'

/** A new passphrase, typed twice (setup, recovery, change). */
export function PassphraseFields({
  id,
  label = 'Passphrase',
  passphrase,
  confirm,
  onPassphrase,
  onConfirm,
}: {
  id: string
  label?: string
  passphrase: string
  confirm: string
  onPassphrase: (value: string) => void
  onConfirm: (value: string) => void
}) {
  const mismatch = confirm.length > 0 && confirm !== passphrase
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-passphrase`}>{label}</Label>
        <Input
          id={`${id}-passphrase`}
          type="password"
          autoComplete="new-password"
          value={passphrase}
          onChange={(event) => onPassphrase(event.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          At least {MIN_PASSPHRASE} characters; a few unrelated words work well. We can’t reset it:
          your recovery key is the only other way in.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-confirm`}>Type it again</Label>
        <Input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={confirm}
          aria-invalid={mismatch || undefined}
          onChange={(event) => onConfirm(event.target.value)}
        />
        {mismatch && <p className="text-xs text-destructive">The two passphrases don’t match.</p>}
      </div>
    </div>
  )
}
