import { useEffect, useMemo, useReducer, useState } from 'react'
import { getDb } from '@/engine/duckdb'
import { PageCache } from '@/engine/pageCache'
import { fetchPage, PAGE_SIZE, type PagedResult, type SortSpec } from '@/engine/paging'
import type { CellValue } from '@/engine/types'
import { isCancellation, toAppError, type AppError } from '@/lib/errors'

export interface GridRows {
  getRow: (index: number) => CellValue[] | undefined
  request: (first: number, last: number, direction: 'forward' | 'backward') => void
}

/** Keeps this many 200-row pages (12k rows) around while scrolling. */
const MAX_PAGES = 60

/**
 * Rows of `result` in `sorting` order, loaded page by page as the grid scrolls. To retry after an
 * error, remount the component (new `key`) so the cache starts empty.
 */
export function useGridRows(result: PagedResult, sorting: SortSpec[]) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [failure, setFailure] = useState<{ cache: PageCache; error: AppError } | null>(null)

  const cache = useMemo(() => {
    const created: PageCache = new PageCache(
      async (page, signal) =>
        fetchPage(
          await getDb(),
          result,
          { offset: page * PAGE_SIZE, limit: PAGE_SIZE, sorting },
          signal,
        ),
      {
        pageSize: PAGE_SIZE,
        rowCount: result.rowCount,
        maxPages: MAX_PAGES,
        onChange: rerender,
        onError: (error) => {
          if (!isCancellation(error)) setFailure({ cache: created, error: toAppError(error) })
        },
      },
    )
    return created
  }, [result, sorting])

  useEffect(() => () => cache.cancelAll(), [cache])

  const rows: GridRows = useMemo(
    () => ({
      getRow: (index) => cache.getRow(index),
      request: (first, last, direction) => cache.request(first, last, direction),
    }),
    [cache],
  )
  return { rows, error: failure?.cache === cache ? failure.error : null }
}
