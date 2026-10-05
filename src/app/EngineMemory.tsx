import { useEffect, useState } from 'react'
import { getDb } from '@/engine/duckdb'
import { engineMemory, type EngineMemory as Memory } from '@/engine/memory'
import { formatBytes, humanizeName } from '@/lib/format'
import { useSettingsStore } from '@/stores/settings'

const TAGS: Record<string, string> = {
  IN_MEMORY_TABLE: 'Tables',
  BASE_TABLE: 'Tables',
  HASH_TABLE: 'Joins and grouping',
  ORDER_BY: 'Sorting',
  ART_INDEX: 'Indexes',
  COLUMN_DATA: 'Query results',
  METADATA: 'Metadata',
  OVERFLOW_STRINGS: 'Long text',
  EXTENSION: 'Extensions',
}

const POLL_MS = 2_000

/** DuckDB's memory use (F-PERF-05), refreshed while the engine popover is open. */
export function EngineMemory() {
  const locale = useSettingsStore((state) => state.locale)
  const [memory, setMemory] = useState<Memory | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer = 0
    const read = () =>
      getDb()
        .then((engine) => engineMemory(engine, controller.signal))
        .then((next) => {
          setMemory(next)
          timer = window.setTimeout(read, POLL_MS)
        })
        .catch(() => undefined) // the popover just shows no figure
    void read()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [])

  if (!memory) return null
  return (
    <>
      <dt className="text-muted-foreground">Memory</dt>
      <dd>
        <span className="tabular-nums">{formatBytes(memory.totalBytes, locale)}</span>
        {memory.temporaryBytes > 0 && (
          <span className="text-muted-foreground">
            {' '}
            + {formatBytes(memory.temporaryBytes, locale)} spilled
          </span>
        )}
        {memory.top.length > 0 && (
          <ul aria-label="Largest memory users" className="mt-0.5 text-muted-foreground">
            {memory.top.map((entry) => (
              <li key={entry.tag} className="flex justify-between gap-2 tabular-nums">
                <span>{TAGS[entry.tag] ?? humanizeName(entry.tag.toLowerCase())}</span>
                <span>{formatBytes(entry.bytes, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </>
  )
}
