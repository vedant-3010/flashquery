import { getDb } from '@/engine/duckdb'
import { DEFAULT_CSV_OPTIONS, type CsvOptions } from '@/engine/ingest'
import { toTableName } from '@/engine/naming'
import { profileTable } from '@/engine/profile'
import { previewRetype, retypeColumn, type RetypePreview, type TypeOverride } from '@/engine/retype'
import { inputs } from '@/stores/datasetInputs'
import { newId, useDatasetsStore } from '@/stores/datasets'
import { notesOf, withNotes } from '@/stores/notes'

// Changing how a dataset is loaded: CSV import options and re-import (F-DATA-08), column type
// overrides (F-DATA-09) and pasted data (F-DATA-10). Overrides are kept with the input, so a
// re-import or "Restart engine" applies them again.

const find = (id: string) => useDatasetsStore.getState().datasets.find((d) => d.id === id)

/** The import options of a CSV file dataset; null for anything that has none. */
export function importOptionsOf(id: string): { csv: CsvOptions; ignoreErrors: boolean } | null {
  const stored = inputs.get(id)
  if (stored?.input.kind !== 'file' || stored.input.format !== 'csv') return null
  return { csv: stored.input.csv ?? DEFAULT_CSV_OPTIONS, ignoreErrors: stored.ignoreErrors }
}

/** Loads a CSV again with new options; the old table stays until the new one is ready. */
export function reimportDataset(id: string, csv: CsvOptions, ignoreErrors: boolean): void {
  const dataset = find(id)
  const stored = inputs.get(id)
  if (!dataset || stored?.input.kind !== 'file') return
  useDatasetsStore
    .getState()
    .startJob(
      { id, label: dataset.label, table: dataset.table },
      { ...stored, input: { ...stored.input, csv }, ignoreErrors, replace: true },
    )
}

export async function previewColumnType(
  id: string,
  override: TypeOverride,
  signal?: AbortSignal,
): Promise<RetypePreview | null> {
  const dataset = find(id)
  if (!dataset) return null
  return previewRetype(await getDb(), dataset.table, override, signal)
}

/** Converts a column in place (TRY_CAST) and profiles the table again. */
export async function changeColumnType(id: string, override: TypeOverride): Promise<void> {
  const dataset = find(id)
  if (!dataset) return
  const engine = await getDb()
  await retypeColumn(engine, dataset.table, override)
  const profile = await profileTable(engine, dataset.table)
  const stored = inputs.get(id)
  if (stored) {
    const others = (stored.overrides ?? []).filter((o) => o.column !== override.column)
    inputs.set(id, { ...stored, overrides: [...others, override] })
  }
  useDatasetsStore.getState().replaceDataset(
    withNotes(
      {
        ...dataset,
        rowCount: profile.rowCount,
        schemaHash: profile.schemaHash,
        columns: profile.columns,
        // A new createdAt reopens previews and recomputes histograms.
        createdAt: Date.now(),
      },
      notesOf(dataset),
    ),
  )
}

/** A new table from tab-separated text pasted from a spreadsheet; returns the table name. */
export function addPastedData(text: string, name: string): string {
  const state = useDatasetsStore.getState()
  const taken = [...state.datasets.map((d) => d.table), ...state.jobs.map((j) => j.table)]
  const table = toTableName(name.trim() || 'pasted_data', taken)
  state.startJob(
    { id: newId(), label: name.trim() || 'Pasted data', table },
    { input: { kind: 'paste', text }, ignoreErrors: false },
  )
  return table
}
