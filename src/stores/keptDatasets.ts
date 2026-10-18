import { z } from '@/lib/zod'
import type { DatasetInput } from '@/engine/load'
import { CsvOptionsSchema } from '@/engine/ingest'
import { TypeOverrideSchema } from '@/engine/retype'
import { SAMPLES } from '@/engine/samples'
import type { RecordSpec } from '@/lib/idb'

// The kept-files manifest (F-DATA-12): how each kept dataset loads again, and (M17) where its file
// is in the account. Kept up to date by src/stores/persistFiles.ts.

const PersistedInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    format: z.enum(['csv', 'parquet', 'json']),
    csv: CsvOptionsSchema.nullable(),
  }),
  z.object({ kind: z.literal('excel'), sheet: z.string() }),
  z.object({ kind: z.literal('paste') }),
  z.object({ kind: z.literal('sample'), sampleId: z.string() }),
])
type PersistedInput = z.infer<typeof PersistedInputSchema>

/** A kept file saved to the account (M17): encrypted chunks `<user>/<fileId>/<n>` in storage. */
export const CloudFileSchema = z.object({
  fileId: z.string(),
  /** Its size once encrypted. */
  bytes: z.number(),
  chunks: z.number(),
})
export type CloudFile = z.infer<typeof CloudFileSchema>

export const PersistedDatasetSchema = z.object({
  id: z.string(),
  table: z.string(),
  label: z.string(),
  fileName: z.string().nullable(),
  /** The bytes are in OPFS under `id` (not for samples). */
  stored: z.boolean(),
  input: PersistedInputSchema,
  ignoreErrors: z.boolean(),
  overrides: z.array(TypeOverrideSchema),
  savedAt: z.number(),
  /** In the account too (M17); null: only on this device. */
  cloud: CloudFileSchema.nullable(),
})
export type PersistedDataset = z.infer<typeof PersistedDatasetSchema>

export const PERSISTED_RECORD: RecordSpec<PersistedDataset[]> = {
  key: 'persistedDatasets',
  version: 2,
  schema: z.array(PersistedDatasetSchema),
  migrations: {
    // v2 (M17): files saved to the account say where.
    1: (data) => (Array.isArray(data) ? data.map((e: object) => ({ ...e, cloud: null })) : data),
  },
  fallback: () => [],
}

/** What to keep for a loaded input: how to load it again, and the bytes (null for samples). */
export function describeInput(input: DatasetInput): {
  input: PersistedInput
  fileName: string | null
  blob: Blob | null
} {
  switch (input.kind) {
    case 'file':
      return {
        input: { kind: 'file', format: input.format, csv: input.csv ?? null },
        fileName: input.file.name,
        blob: input.file,
      }
    case 'excel':
      return {
        input: { kind: 'excel', sheet: input.sheet },
        fileName: input.file.name,
        blob: input.file,
      }
    case 'paste':
      return {
        input: { kind: 'paste' },
        fileName: null,
        blob: new Blob([input.text], { type: 'text/plain' }),
      }
    case 'sample':
      return { input: { kind: 'sample', sampleId: input.sample.id }, fileName: null, blob: null }
  }
}

/** The input to load a kept dataset again, or null when it can't be (missing sample). */
export async function toDatasetInput(
  entry: PersistedDataset,
  stored: File | null,
): Promise<DatasetInput | null> {
  const file = () => new File([stored ?? new Blob()], entry.fileName ?? entry.label)
  switch (entry.input.kind) {
    case 'file':
      return stored
        ? {
            kind: 'file',
            file: file(),
            format: entry.input.format,
            csv: entry.input.csv ?? undefined,
          }
        : null
    case 'excel':
      return stored ? { kind: 'excel', file: file(), sheet: entry.input.sheet } : null
    case 'paste':
      return stored ? { kind: 'paste', text: await stored.text() } : null
    case 'sample': {
      const sampleId = entry.input.sampleId
      const sample = SAMPLES.find((s) => s.id === sampleId)
      return sample ? { kind: 'sample', sample } : null
    }
  }
}
