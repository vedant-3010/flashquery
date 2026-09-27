import { create } from 'zustand'
import { getDb, restartDb } from '@/engine/duckdb'
import { detectFormat, sizeWarning } from '@/engine/ingest'
import { loadDataset, type DatasetInput } from '@/engine/load'
import { isValidTableName, quoteIdent, toTableName } from '@/engine/naming'
import { SAMPLES, type SampleId } from '@/engine/samples'
import type { DatasetProfile } from '@/engine/types'
import { AppError, isCancellation, toAppError, type AppErrorData } from '@/lib/errors'
import { useUiStore } from '@/stores/ui'
import { closeWorkbook, openWorkbook } from '@/workers/clients'
import type { SheetInfo } from '@/workers/xlsx'

export interface IngestJob {
  id: string
  label: string
  table: string
  status: 'loading' | 'profiling' | 'choose-sheet' | 'error'
  startedAt: number
  /** Size guardrail shown while loading. */
  warning: string | null
  error: AppErrorData | null
  /** Sheets to choose from (multi-sheet Excel). */
  sheets: SheetInfo[] | null
  canRetry: boolean
}

interface DatasetsState {
  datasets: DatasetProfile[]
  jobs: IngestJob[]
  restarting: boolean
  addFiles: (files: File[]) => void
  loadSample: (id: SampleId) => void
  chooseSheet: (jobId: string, sheet: string) => void
  retryJob: (jobId: string, options?: { skipBadRows?: boolean }) => void
  cancelJob: (jobId: string) => void
  renameDataset: (id: string, next: { label: string; table: string }) => Promise<void>
  removeDataset: (id: string) => Promise<void>
  restartEngine: () => Promise<void>
}

// Not state: how each job/dataset was loaded (kept, with its File, for Retry and Restart engine),
// in-flight cancellation, and Excel workbooks parsed for the sheet picker.
const inputs = new Map<string, { input: DatasetInput; ignoreErrors: boolean }>()
const excelFiles = new Map<string, File>()
const workbooks = new Map<string, string>()
const controllers = new Map<string, AbortController>()

let counter = 0
const newId = () => `ds_${Date.now().toString(36)}_${(counter += 1)}`

export const useDatasetsStore = create<DatasetsState>()((set, get) => {
  const findJob = (id: string) => get().jobs.find((job) => job.id === id)
  const patchJob = (id: string, patch: Partial<IngestJob>) =>
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    }))
  const removeJob = (id: string) =>
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }))
  const failJob = (id: string, error: AppError, canRetry = true) =>
    patchJob(id, { status: 'error', error: error.toJSON(), canRetry })
  const takenTables = (except?: string) =>
    [...get().datasets.map((d) => d.table), ...get().jobs.map((j) => j.table)].filter(
      (table) => table !== except,
    )

  const addJob = (job: Omit<IngestJob, 'status' | 'startedAt' | 'error' | 'sheets' | 'canRetry'>) =>
    set((state) => ({
      jobs: [
        ...state.jobs,
        {
          ...job,
          status: 'loading',
          startedAt: Date.now(),
          error: null,
          sheets: null,
          canRetry: true,
        },
      ],
    }))

  async function runJob(id: string) {
    const stored = inputs.get(id)
    const job = findJob(id)
    if (!stored || !job) return
    const controller = new AbortController()
    controllers.set(id, controller)
    patchJob(id, { status: 'loading', error: null, startedAt: Date.now() })
    try {
      const engine = await getDb()
      const dataset = await loadDataset(engine, {
        id,
        table: job.table,
        label: job.label,
        input: stored.input,
        ignoreErrors: stored.ignoreErrors,
        signal: controller.signal,
        onProfiling: () => patchJob(id, { status: 'profiling' }),
      })
      set((state) => ({
        datasets: [...state.datasets.filter((d) => d.table !== dataset.table), dataset],
        jobs: state.jobs.filter((j) => j.id !== id),
      }))
    } catch (error) {
      if (isCancellation(error)) {
        removeJob(id)
        inputs.delete(id)
        return
      }
      failJob(id, toAppError(error, 'ingest_failed', `${job.label} couldn't be loaded.`))
    } finally {
      controllers.delete(id)
      // The parsed workbook is closed after every attempt; retries re-open the file.
      if (stored.input.kind === 'excel' && inputs.has(id)) {
        inputs.set(id, { ...stored, input: { ...stored.input, workbookId: undefined } })
      }
    }
  }

  async function prepareExcel(id: string, file: File) {
    patchJob(id, { status: 'loading', error: null, startedAt: Date.now() })
    try {
      const workbook = await openWorkbook(file)
      if (!findJob(id)) return void closeWorkbook(workbook.id) // cancelled while parsing
      const sheets = workbook.sheets.filter((sheet) => sheet.rows > 0)
      const [only] = sheets
      if (!only) {
        void closeWorkbook(workbook.id)
        failJob(
          id,
          new AppError({
            code: 'empty_workbook',
            message: 'This workbook has no data.',
            detail: null,
          }),
          false,
        )
      } else if (sheets.length === 1) {
        inputs.set(id, {
          input: { kind: 'excel', file, sheet: only.name, workbookId: workbook.id },
          ignoreErrors: false,
        })
        void runJob(id)
      } else {
        workbooks.set(id, workbook.id)
        patchJob(id, { status: 'choose-sheet', sheets })
      }
    } catch (error) {
      failJob(id, toAppError(error, 'excel_read', `${file.name} couldn't be read as a workbook.`))
    }
  }

  return {
    datasets: [],
    jobs: [],
    restarting: false,

    addFiles: (files) => {
      for (const file of files) {
        const id = newId()
        const format = detectFormat(file.name)
        if (!format) {
          addJob({ id, label: file.name, table: '', warning: null })
          failJob(
            id,
            new AppError({
              code: 'unsupported_type',
              message: `${file.name} isn't a supported file. Use CSV, TSV, Excel, Parquet or JSON.`,
              detail: null,
            }),
            false,
          )
          continue
        }
        const table = toTableName(file.name, takenTables())
        addJob({ id, label: file.name, table, warning: sizeWarning(file.size, format) })
        if (format === 'excel') {
          excelFiles.set(id, file)
          void prepareExcel(id, file)
        } else {
          inputs.set(id, { input: { kind: 'file', file, format }, ignoreErrors: false })
          void runJob(id)
        }
      }
    },

    loadSample: (sampleId) => {
      const sample = SAMPLES.find((s) => s.id === sampleId)
      if (!sample || get().jobs.some((job) => job.table === sample.table)) return
      // A sample replaces an earlier sample in the same table, never a dataset the user loaded.
      const existing = get().datasets.find((d) => d.table === sample.table)
      const replace = existing?.source.kind === 'sample'
      if (existing && replace) {
        inputs.delete(existing.id)
        set((state) => ({ datasets: state.datasets.filter((d) => d.id !== existing.id) }))
      }
      const id = newId()
      const table = replace ? sample.table : toTableName(sample.table, takenTables())
      addJob({ id, label: sample.label, table, warning: null })
      inputs.set(id, { input: { kind: 'sample', sample }, ignoreErrors: false })
      void runJob(id)
    },

    chooseSheet: (jobId, sheet) => {
      const file = excelFiles.get(jobId)
      const job = findJob(jobId)
      if (!file || !job) return
      const stem = file.name.replace(/\.[^.]+$/, '')
      patchJob(jobId, {
        label: `${file.name} · ${sheet}`,
        table: toTableName(`${stem} ${sheet}`, takenTables(job.table)),
        sheets: null,
      })
      inputs.set(jobId, {
        input: { kind: 'excel', file, sheet, workbookId: workbooks.get(jobId) },
        ignoreErrors: false,
      })
      workbooks.delete(jobId)
      void runJob(jobId)
    },

    retryJob: (jobId, { skipBadRows = false } = {}) => {
      const stored = inputs.get(jobId)
      if (stored) {
        inputs.set(jobId, { ...stored, ignoreErrors: stored.ignoreErrors || skipBadRows })
        void runJob(jobId)
        return
      }
      const file = excelFiles.get(jobId)
      if (file) void prepareExcel(jobId, file)
    },

    cancelJob: (jobId) => {
      controllers.get(jobId)?.abort()
      const workbook = workbooks.get(jobId)
      if (workbook) void closeWorkbook(workbook)
      if (!controllers.has(jobId)) {
        // Not running (choosing a sheet, parsing Excel, or failed): just drop it.
        removeJob(jobId)
        for (const map of [inputs, excelFiles, workbooks]) map.delete(jobId)
      }
    },

    renameDataset: async (id, next) => {
      const dataset = get().datasets.find((d) => d.id === id)
      if (!dataset) return
      const table = next.table.trim()
      if (table !== dataset.table) {
        if (!isValidTableName(table)) {
          throw new AppError({
            code: 'invalid_table_name',
            message:
              'Use lowercase letters, digits and underscores, start with a letter, and avoid SQL keywords.',
            detail: null,
          })
        }
        if (takenTables(dataset.table).includes(table)) {
          throw new AppError({
            code: 'table_name_taken',
            message: `There's already a table called ${table}.`,
            detail: null,
          })
        }
        const engine = await getDb()
        await engine.run(`ALTER TABLE ${quoteIdent(dataset.table)} RENAME TO ${quoteIdent(table)}`)
      }
      set((state) => ({
        datasets: state.datasets.map((d) =>
          d.id === id ? { ...d, table, label: next.label.trim() || table } : d,
        ),
      }))
      const ui = useUiStore.getState()
      if (ui.previewTable === dataset.table) ui.showPreview(table)
    },

    removeDataset: async (id) => {
      const dataset = get().datasets.find((d) => d.id === id)
      if (!dataset) return
      const engine = await getDb()
      await engine.run(`DROP TABLE IF EXISTS ${quoteIdent(dataset.table)}`)
      inputs.delete(id)
      excelFiles.delete(id)
      set((state) => ({ datasets: state.datasets.filter((d) => d.id !== id) }))
      const ui = useUiStore.getState()
      if (ui.previewTable === dataset.table) ui.showPreview(null)
    },

    restartEngine: async () => {
      for (const controller of controllers.values()) controller.abort()
      const previous = get().datasets
      set({ restarting: true, datasets: [], jobs: [] })
      try {
        await restartDb()
      } catch {
        // The engine status shows the error and offers another restart.
        set({ restarting: false, datasets: previous })
        return
      }
      // Tables lived in the old engine: load everything again, in the original order.
      for (const dataset of previous) {
        if (!inputs.has(dataset.id)) continue
        addJob({ id: dataset.id, label: dataset.label, table: dataset.table, warning: null })
        await runJob(dataset.id)
      }
      set({ restarting: false })
    },
  }
})
