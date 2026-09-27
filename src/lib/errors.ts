import { z } from 'zod'

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

/** Normalizes anything thrown (AppError, AppErrorData from a worker, Error, string, ...) to AppError. */
export function toAppError(error: unknown, code = 'unknown'): AppError {
  if (error instanceof AppError) return error
  const data = AppErrorDataSchema.safeParse(error)
  if (data.success) return new AppError(data.data)
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : describe(error)
  return new AppError({ code, message: FALLBACK_MESSAGE, detail })
}
