import { z } from '@/lib/zod'

/** Plain error shape: survives worker boundaries, JSON and IndexedDB, where Error subclasses don't. */
export const AppErrorDataSchema = z.object({
  code: z.string(),
  /** Friendly one-liner shown in the UI. */
  message: z.string(),
  /** Technical detail behind "Show details". */
  detail: z.string().nullable(),
})
export type AppErrorData = z.infer<typeof AppErrorDataSchema>

export class AppError extends Error {
  readonly code: string
  readonly detail: string | null

  constructor({ code, message, detail }: AppErrorData) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.detail = detail
  }

  toJSON(): AppErrorData {
    return { code: this.code, message: this.message, detail: this.detail }
  }
}

const FALLBACK_MESSAGE = 'Something went wrong.'

function describe(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * Normalizes anything thrown (AppError, AppErrorData from a worker, Error, string, ...) to AppError.
 * `code` and `message` apply only when the error isn't already an AppError.
 */
export function toAppError(error: unknown, code = 'unknown', message = FALLBACK_MESSAGE): AppError {
  if (error instanceof AppError) return error
  const data = AppErrorDataSchema.safeParse(error)
  if (data.success) return new AppError(data.data)
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : describe(error)
  return new AppError({ code, message, detail })
}

/** The AppError for an aborted operation: `timeout` for AbortSignal.timeout(), else `cancelled`. */
export function abortError(signal: AbortSignal): AppError {
  const reason: unknown = signal.reason
  const timedOut = reason instanceof DOMException && reason.name === 'TimeoutError'
  return timedOut
    ? new AppError({ code: 'timeout', message: 'Stopped because it took too long.', detail: null })
    : new AppError({ code: 'cancelled', message: 'Cancelled.', detail: null })
}

export function isCancellation(error: unknown): boolean {
  return error instanceof AppError && error.code === 'cancelled'
}
