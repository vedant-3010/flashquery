import { redactSecrets } from '@/ai/log'
import { downloadBytes } from '@/lib/download'
import type { CorruptRecord } from '@/lib/idb'

/**
 * A record as it will be written to the backup file, without any saved AI key: the file lands in
 * Downloads, in plain text (the settings record keeps keys under `apiKeys` with "Remember on this
 * device").
 */
export function withoutSecrets(raw: unknown): unknown {
  if (Array.isArray(raw)) return raw.map(withoutSecrets)
  if (typeof raw !== 'object' || raw === null) return raw
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) =>
      key === 'apiKeys' && typeof value === 'object' && value !== null
        ? [key, Object.fromEntries(Object.keys(value).map((provider) => [provider, null]))]
        : [key, withoutSecrets(value)],
    ),
  )
}

/**
 * A saved record couldn't be read (F-EXP-02): hand the raw data to the user as a backup file before
 * it is reset, so nothing is lost silently.
 */
export function backupCorruptRecord(record: CorruptRecord): void {
  console.warn(
    `HushGlance: resetting unreadable "${record.key}" data (${record.reason}); backup downloaded.`,
  )
  // Anything key-shaped elsewhere in the record is blanked too.
  const json = redactSecrets(
    JSON.stringify(
      { key: record.key, reason: record.reason, data: withoutSecrets(record.raw) },
      null,
      2,
    ),
  )
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBytes(
    new TextEncoder().encode(json),
    `HushGlance-${record.key}-backup-${stamp}.json`,
    'application/json',
  )
}
