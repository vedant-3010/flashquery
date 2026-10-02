import type { DatasetInput } from '@/engine/load'
import type { TypeOverride } from '@/engine/retype'

// Not state: how each job/dataset was loaded (kept, with its File, for Retry, re-import and Restart
// engine), in-flight cancellation, and Excel workbooks parsed for the sheet picker.

export interface StoredInput {
  input: DatasetInput
  ignoreErrors: boolean
  /** Column type overrides, re-applied on every reload (F-DATA-09). */
  overrides?: TypeOverride[]
  /** The next load replaces an existing table (re-import, F-DATA-08). */
  replace?: boolean
}

export const inputs = new Map<string, StoredInput>()
/** The input before a re-import, restored if the re-import is cancelled. */
export const previousInputs = new Map<string, StoredInput>()
export const excelFiles = new Map<string, File>()
export const workbooks = new Map<string, string>()
/** Time spent parsing a workbook for the sheet picker, added to the dataset's load time. */
export const excelParseMs = new Map<string, number>()
export const controllers = new Map<string, AbortController>()

/** Drops a job's input, or puts back the one a cancelled re-import replaced. */
export function forgetInput(id: string): void {
  const previous = previousInputs.get(id)
  previousInputs.delete(id)
  if (previous) inputs.set(id, previous)
  else inputs.delete(id)
}
