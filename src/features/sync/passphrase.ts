// Passphrase rules for the encrypted workspace (M17).

/** A passphrase is at least this long (a few unrelated words). */
export const MIN_PASSPHRASE = 10

/** Why a new passphrase can't be used yet, or null. */
export function passphraseProblem(passphrase: string, confirm: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`
  if (passphrase !== confirm) return 'The two passphrases don’t match.'
  return null
}
