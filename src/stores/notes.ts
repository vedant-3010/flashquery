import { z } from '@/lib/zod'
import { create } from 'zustand'
import type { DatasetProfile } from '@/engine/types'
import { loadRecord, saveRecord, type RecordSpec } from '@/lib/idb'
import { backupCorruptRecord } from '@/stores/persistence'

// Business notes (F-PROF-05): free text per dataset, a description and unit per column ("fiscal year
// starts in April", "amounts are INR"). Saved by schemaHash, so re-uploading the same file brings
// them back; sent to the AI in every privacy mode, inside the <data> block (they're user text).

export const ColumnNoteSchema = z.object({
  description: z.string().max(500).nullable(),
  unit: z.string().max(40).nullable(),
})

export const DatasetNotesSchema = z.object({
  notes: z.string().max(4_000).nullable(),
  columns: z.record(z.string(), ColumnNoteSchema),
})
export type DatasetNotes = z.infer<typeof DatasetNotesSchema>

export const NOTES_RECORD: RecordSpec<Record<string, DatasetNotes>> = {
  key: 'notes',
  version: 1,
  schema: z.record(z.string(), DatasetNotesSchema),
  fallback: () => ({}),
}

/** The notes as they are on a dataset profile. */
export function notesOf(dataset: DatasetProfile): DatasetNotes {
  return {
    notes: dataset.notes,
    columns: Object.fromEntries(
      dataset.columns
        .filter((c) => c.description || c.unit)
        .map((c) => [c.name, { description: c.description, unit: c.unit }]),
    ),
  }
}

/** A profile with saved notes applied (columns that no longer exist are ignored). */
export function withNotes(
  dataset: DatasetProfile,
  notes: DatasetNotes | undefined,
): DatasetProfile {
  if (!notes) return dataset
  return {
    ...dataset,
    notes: notes.notes,
    columns: dataset.columns.map((column) => {
      const note = notes.columns[column.name]
      return note ? { ...column, description: note.description, unit: note.unit } : column
    }),
  }
}

const clean = (text: string | null) => {
  const trimmed = text?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

interface NotesState {
  bySchema: Record<string, DatasetNotes>
  hydrated: boolean
  save: (schemaHash: string, notes: DatasetNotes) => DatasetNotes
  hydrate: () => Promise<void>
}

export const useNotesStore = create<NotesState>()((set, get) => ({
  bySchema: {},
  hydrated: false,
  save: (schemaHash, notes) => {
    const cleaned: DatasetNotes = {
      notes: clean(notes.notes),
      columns: Object.fromEntries(
        Object.entries(notes.columns)
          .map(
            ([name, note]) =>
              [name, { description: clean(note.description), unit: clean(note.unit) }] as const,
          )
          .filter(([, note]) => note.description || note.unit),
      ),
    }
    const empty = !cleaned.notes && Object.keys(cleaned.columns).length === 0
    const next = { ...get().bySchema }
    if (empty) delete next[schemaHash]
    else next[schemaHash] = cleaned
    set({ bySchema: next })
    return cleaned
  },
  hydrate: () => (hydrating ??= load()),
}))

let hydrating: Promise<void> | null = null

async function load() {
  const saved = await loadRecord(NOTES_RECORD, { onCorrupt: backupCorruptRecord }).catch(
    (error: unknown) => {
      console.warn('flashQuery: notes could not be loaded', error)
      return {}
    },
  )
  useNotesStore.setState((state) => ({ bySchema: { ...saved, ...state.bySchema }, hydrated: true }))
  useNotesStore.subscribe((state, previous) => {
    if (state.bySchema === previous.bySchema) return
    saveRecord(NOTES_RECORD, state.bySchema).catch((error: unknown) =>
      console.warn('flashQuery: notes could not be saved', error),
    )
  })
}
