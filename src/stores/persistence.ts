import { downloadBytes } from '@/lib/download'
import type { CorruptRecord } from '@/lib/idb'

/**
 * A saved record couldn't be read (F-EXP-02): hand the raw data to the user as a backup file before
 * it is reset, so nothing is lost silently.
 */
export function backupCorruptRecord(record: CorruptRecord): void {
  console.warn(
    `AskData: resetting unreadable "${record.key}" data (${record.reason}); backup downloaded.`,
  )
  const json = JSON.stringify({ key: record.key, reason: record.reason, data: record.raw }, null, 2)
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBytes(
    new TextEncoder().encode(json),
    `askdata-${record.key}-backup-${stamp}.json`,
    'application/json',
  )
}
