import { useState } from 'react'
import { toAppError, type AppErrorData } from '@/lib/errors'

/** Runs one account request at a time, with its pending state and error, for a form. */
export function useAuthAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AppErrorData | null>(null)
  const run = async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    setPending(true)
    setError(null)
    try {
      return await task()
    } catch (caught) {
      setError(toAppError(caught).toJSON())
      return undefined
    } finally {
      setPending(false)
    }
  }
  return { pending, error, run, setError }
}
