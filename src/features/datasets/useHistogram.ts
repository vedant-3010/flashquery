import { useEffect, useState } from 'react'
import { getDb } from '@/engine/duckdb'
import { columnHistogram, histogramKind, type Histogram } from '@/engine/histogram'
import type { ColumnProfile, DatasetProfile } from '@/engine/types'
import { isCancellation } from '@/lib/errors'

// Histograms are computed once per loaded dataset and column, when a profile first opens.
const cache = new Map<string, Histogram | null>()

/** The column's histogram (F-PROF-06); undefined while loading or for non-numeric columns. */
export function useHistogram(
  dataset: DatasetProfile | undefined,
  column: ColumnProfile,
): Histogram | null | undefined {
  const key = dataset ? `${dataset.id}@${dataset.createdAt}|${column.name}` : null
  const [loaded, setLoaded] = useState<{ key: string; histogram: Histogram | null } | null>(null)
  const wanted = key !== null && histogramKind(column.type) !== null

  useEffect(() => {
    if (!wanted || !dataset || key === null || cache.has(key)) return
    const controller = new AbortController()
    getDb()
      .then((engine) => columnHistogram(engine, dataset.table, column, controller.signal))
      .then((histogram) => {
        cache.set(key, histogram)
        setLoaded({ key, histogram })
      })
      .catch((error: unknown) => {
        if (isCancellation(error)) return
        console.warn('flashQuery: histogram failed', error)
        cache.set(key, null)
        setLoaded({ key, histogram: null })
      })
    return () => controller.abort()
  }, [wanted, dataset, column, key])

  if (!wanted || key === null) return null
  if (cache.has(key)) return cache.get(key)
  return loaded?.key === key ? loaded.histogram : undefined
}
