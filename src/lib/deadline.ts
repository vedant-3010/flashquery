import { AppError } from '@/lib/errors'

/**
 * Waits for `task`, but gives up when `signal` aborts or `timeoutMs` passes; `onGiveUp` runs first
 * (e.g. terminating a worker that can't be interrupted). Rejects with AppError `cancelled` or
 * `timeout`.
 */
export function withDeadline<T>(
  task: Promise<T>,
  {
    signal,
    timeoutMs,
    onGiveUp,
  }: { signal?: AbortSignal; timeoutMs: number; onGiveUp: () => void },
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      action()
    }
    const giveUp = (error: AppError) =>
      finish(() => {
        onGiveUp()
        reject(error)
      })
    const onAbort = () =>
      giveUp(new AppError({ code: 'cancelled', message: 'Stopped.', detail: null }))
    const timer = window.setTimeout(
      () =>
        giveUp(
          new AppError({
            code: 'timeout',
            message: `Stopped after ${Math.round(timeoutMs / 1000)} s.`,
            detail: null,
          }),
        ),
      timeoutMs,
    )
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
    task.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}
