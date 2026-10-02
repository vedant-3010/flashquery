import { useEffect, useMemo, useReducer, useState } from 'react'
import { getDb } from '@/engine/duckdb'
import type { ColumnFilter } from '@/engine/gridFilters'
import { PageCache } from '@/engine/pageCache'
import {
  countFiltered,
  fetchPage,
  PAGE_SIZE,
  type PagedResult,
  type SortSpec,
} from '@/engine/paging'
import type { CellValue } from '@/engine/types'
import { isCancellation, toAppError, type AppError } from '@/lib/errors'

export interface GridRows {
  getRow: (index: number) => CellValue[] | undefined
  request: (first: number, last: number, direction: 'forward' | 'backward') => void
}

/** Keeps this many 200-row pages (12k rows) around while scrolling. */
const MAX_PAGES = 60

const NO_FILTERS: readonly ColumnFilter[] = []

/**
 * Rows of `result` in `sorting` order, filtered (F-GRID-04), loaded page by page as the grid
 * scrolls. `rowCount` is null while a filtered count runs. To retry after an error, remount the
 * component (new `key`) so the cache starts empty.
 */
export function useGridRows(
  result: PagedResult,
  sorting: SortSpec[],
  filters: readonly ColumnFilter[] = NO_FILTERS,
) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [failure, setFailure] = useState<{ key: unknown; error: AppError } | null>(null)
  const [counted, setCounted] = useState<{ filters: readonly ColumnFilter[]; n: number } | null>(
    null,
  )
  const rowCount =
    filters.length === 0 ? result.rowCount : counted?.filters === filters ? counted.n : null

  useEffect(() => {
    if (filters.length === 0) return
    const controller = new AbortController()
    getDb()
      .then((engine) => countFiltered(engine, result, filters, controller.signal))
      .then((n) => setCounted({ filters, n }))
      .catch((error: unknown) => {
        if (!isCancellation(error)) setFailure({ key: filters, error: toAppError(error) })
      })
    return () => controller.abort()
  }, [result, filters])

  const cache = useMemo(() => {
    if (rowCount === null) return null
    const created: PageCache = new PageCache(
      async (page, signal) =>
        fetchPage(
          await getDb(),
          result,
          { offset: page * PAGE_SIZE, limit: PAGE_SIZE, sorting, filters },
          signal,
        ),
      {
        pageSize: PAGE_SIZE,
        rowCount,
        maxPages: MAX_PAGES,
        onChange: rerender,
        onError: (error) => {
          if (!isCancellation(error)) setFailure({ key: created, error: toAppError(error) })
        },
      },
    )
    return created
  }, [result, sorting, filters, rowCount])

  useEffect(() => () => cache?.cancelAll(), [cache])

  const rows: GridRows = useMemo(
    () => ({
      getRow: (index) => cache?.getRow(index),
      request: (first, last, direction) => cache?.request(first, last, direction),
    }),
    [cache],
  )
  const failed = failure && (failure.key === cache || failure.key === filters)
  return { rows, rowCount, error: failed ? failure.error : null }
}
