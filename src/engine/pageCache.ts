import type { CellValue } from '@/engine/types'

// Windowed row cache behind the grid (F-GRID-01): loads pages on demand, prefetches one page in
// the scroll direction, cancels loads the user scrolled away from, and keeps the most recently used
// pages. Framework-free; the grid re-renders on onChange.

export type PageLoader = (page: number, signal: AbortSignal) => Promise<CellValue[][]>

export interface PageCacheOptions {
  pageSize: number
  rowCount: number
  /** Pages kept in memory (least recently used are dropped first). */
  maxPages: number
  onChange: () => void
  onError: (error: unknown) => void
}

export class PageCache {
  private readonly pages = new Map<number, CellValue[][]>()
  private readonly loading = new Map<number, AbortController>()
  private readonly pageCount: number
  private readonly load: PageLoader
  private readonly options: PageCacheOptions

  constructor(load: PageLoader, options: PageCacheOptions) {
    this.load = load
    this.options = options
    this.pageCount = Math.ceil(options.rowCount / options.pageSize)
  }

  getRow(index: number): CellValue[] | undefined {
    return this.pages.get(Math.floor(index / this.options.pageSize))?.[
      index % this.options.pageSize
    ]
  }

  /** Makes rows first…last available (and prefetches one page further in `direction`). */
  request(first: number, last: number, direction: 'forward' | 'backward' = 'forward'): void {
    const { pageSize } = this.options
    const firstPage = Math.max(0, Math.floor(first / pageSize))
    const lastPage = Math.min(this.pageCount - 1, Math.floor(last / pageSize))
    const wanted: number[] = []
    for (let page = firstPage; page <= lastPage; page += 1) wanted.push(page)
    const ahead = direction === 'forward' ? lastPage + 1 : firstPage - 1
    if (ahead >= 0 && ahead < this.pageCount) wanted.push(ahead)

    for (const [page, controller] of this.loading) {
      if (!wanted.includes(page)) {
        controller.abort()
        this.loading.delete(page)
      }
    }
    for (const page of wanted) {
      const rows = this.pages.get(page)
      if (rows) {
        // Refresh its LRU position.
        this.pages.delete(page)
        this.pages.set(page, rows)
      } else if (!this.loading.has(page)) {
        this.fetch(page)
      }
    }
  }

  /** Cancels in-flight loads; cached pages stay and later requests work as before. */
  cancelAll(): void {
    for (const controller of this.loading.values()) controller.abort()
    this.loading.clear()
  }

  private fetch(page: number): void {
    const controller = new AbortController()
    this.loading.set(page, controller)
    this.load(page, controller.signal).then(
      (rows) => {
        if (this.loading.get(page) !== controller) return
        this.loading.delete(page)
        this.pages.set(page, rows)
        while (this.pages.size > this.options.maxPages) {
          const oldest = this.pages.keys().next().value
          if (oldest === undefined) break
          this.pages.delete(oldest)
        }
        this.options.onChange()
      },
      (error: unknown) => {
        if (this.loading.get(page) !== controller) return
        this.loading.delete(page)
        this.options.onError(error)
      },
    )
  }
}
