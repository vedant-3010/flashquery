// Passphrase rules for the encrypted workspace (M17, D124). Whoever holds the database can try
// passphrases offline against the wrapped key (600,000 PBKDF2 rounds each), so the obvious ones
// are refused: too short, too repetitive, or built from the words everyone tries first.

/** A passphrase is at least this long (three or four unrelated words). */
export const MIN_PASSPHRASE = 12

/** Fewer different characters than this is a pattern, not a passphrase ("aaaaaaaaaaaa"). */
const MIN_DISTINCT = 6

/** What people type first; a passphrase made of these and digits is guessed early. */
const COMMON = [
  'password',
  'passphrase',
  'passw0rd',
  'hushglance',
  'qwerty',
  'asdfgh',
  'zxcvbn',
  'letmein',
  'iloveyou',
  'welcome',
  'admin',
  'abcdef',
  'monkey',
  'dragon',
  'sunshine',
  'football',
  'baseball',
  'princess',
  'secret',
  'correcthorsebatterystaple',
]

/** Lowercase letters only: "Pass word 2024!" → "password". */
const lettersOf = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '')

/** True for a passphrase made only of common words (and digits or symbols around them). */
function isCommon(passphrase: string): boolean {
  let rest = lettersOf(passphrase)
  if (rest.length === 0) return true
  for (const word of [...COMMON].sort((a, b) => b.length - a.length)) {
    rest = rest.split(word).join('')
  }
  return rest.length < 4
}

/** Why a new passphrase can't be used yet, or null. */
export function passphraseProblem(passphrase: string, confirm: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`
  if (new Set(passphrase.toLowerCase()).size < MIN_DISTINCT || isCommon(passphrase)) {
    return 'That one is among the first anyone would try. Pick a few unrelated words.'
  }
  if (passphrase !== confirm) return 'The two passphrases don’t match.'
  return null
}
