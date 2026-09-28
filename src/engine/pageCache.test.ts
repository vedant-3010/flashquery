import { describe, expect, it, vi } from 'vitest'
import type { CellValue } from './types'
import { PageCache, type PageLoader } from './pageCache'

const PAGE = 10

/** A loader whose pages resolve when the test says so. */
function controllableLoader() {
  const pending = new Map<number, { resolve: (rows: CellValue[][]) => void; signal: AbortSignal }>()
  const load: PageLoader = (page, signal) =>
    new Promise((resolve) => pending.set(page, { resolve, signal }))
  const resolve = (page: number) => {
    const rows = Array.from({ length: PAGE }, (_, i) => [page * PAGE + i])
    pending.get(page)?.resolve(rows)
    pending.delete(page)
  }
  return { load, pending, resolve }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function cache(load: PageLoader, rowCount = 1000, maxPages = 5) {
  const onChange = vi.fn()
  const onError = vi.fn()
  return {
    cache: new PageCache(load, { pageSize: PAGE, rowCount, maxPages, onChange, onError }),
    onChange,
    onError,
  }
}

describe('PageCache', () => {
  it('loads the visible pages plus one ahead, once', async () => {
    const loader = controllableLoader()
    const { cache: c, onChange } = cache(loader.load)
    c.request(5, 25)
    c.request(5, 25)
    expect([...loader.pending.keys()]).toEqual([0, 1, 2, 3])

    loader.resolve(0)
    loader.resolve(2)
    await flush()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(c.getRow(7)).toEqual([7])
    expect(c.getRow(12)).toBeUndefined()
    expect(c.getRow(25)).toEqual([25])
  })

  it('prefetches backwards when scrolling up and never past the ends', () => {
    const loader = controllableLoader()
    const { cache: c } = cache(loader.load, 45)
    const live = () =>
      [...loader.pending].filter(([, p]) => !p.signal.aborted).map(([page]) => page)
    c.request(30, 44, 'backward')
    expect(live()).toEqual([3, 4, 2])
    c.request(0, 5, 'backward')
    expect(live()).toEqual([0])
  })

  it('cancels loads for pages scrolled away from and ignores their late results', async () => {
    const loader = controllableLoader()
    const { cache: c, onChange } = cache(loader.load)
    c.request(0, 5)
    const early = loader.pending.get(0)
    c.request(500, 505)
    expect(early?.signal.aborted).toBe(true)

    early?.resolve([[0]])
    await flush()
    expect(onChange).not.toHaveBeenCalled()
    expect(c.getRow(0)).toBeUndefined()
  })

  it('evicts the least recently used pages', async () => {
    const loader = controllableLoader()
    const { cache: c } = cache(loader.load, 1000, 2)
    for (const page of [0, 5, 9]) {
      c.request(page * PAGE, page * PAGE + 1, 'backward')
      loader.resolve(page)
      loader.resolve(page - 1)
      await flush()
    }
    expect(c.getRow(0)).toBeUndefined()
    expect(c.getRow(90)).toEqual([90])
  })

  it('reports load errors but not cancellations', async () => {
    const onErrorLoad: PageLoader = (page, signal) =>
      new Promise((_, reject) => {
        if (page === 0) reject(new Error('boom'))
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const { cache: c, onError } = cache(onErrorLoad)
    c.request(0, 5) // page 0 fails; page 1 (prefetch) stays pending
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(new Error('boom'))

    c.cancelAll() // page 1 is aborted: not an error
    await flush()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
