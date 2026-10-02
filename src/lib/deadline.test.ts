import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withDeadline } from './deadline'

// F-PY-05: Stop and timeout give up on a task that can't be interrupted, after cleaning up.

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('withDeadline', () => {
  it('passes results and errors through', async () => {
    const onGiveUp = vi.fn()
    await expect(withDeadline(Promise.resolve(7), { timeoutMs: 100, onGiveUp })).resolves.toBe(7)
    await expect(
      withDeadline(Promise.reject(new Error('boom')), { timeoutMs: 100, onGiveUp }),
    ).rejects.toThrow('boom')
    expect(onGiveUp).not.toHaveBeenCalled()
  })

  it('gives up after the timeout', async () => {
    const onGiveUp = vi.fn()
    const pending = withDeadline(new Promise(() => undefined), { timeoutMs: 60_000, onGiveUp })
    vi.advanceTimersByTime(60_000)
    await expect(pending).rejects.toMatchObject({ code: 'timeout', message: 'Stopped after 60 s.' })
    expect(onGiveUp).toHaveBeenCalledOnce()
  })

  it('gives up when stopped', async () => {
    const onGiveUp = vi.fn()
    const controller = new AbortController()
    const pending = withDeadline(new Promise(() => undefined), {
      signal: controller.signal,
      timeoutMs: 60_000,
      onGiveUp,
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(onGiveUp).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60_000)
    expect(onGiveUp).toHaveBeenCalledOnce()
  })
})
