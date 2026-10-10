import { z } from '@/lib/zod'
import { SAMPLES, type SampleId } from '@/engine/samples'
import { idbStore, type KeyValueStore } from '@/lib/idb'
import { projectKey } from '@/stores/projectScope'

// What to do once a project opens, chosen on Home (F-HOME-03, D113): load a sample or files, import
// a workspace file, ask a question, or run the try demo (F-HOME-04). Kept in memory, and also in
// IndexedDB when opening the project reloads the page (Files are stored as they are).

const SAMPLE_IDS = SAMPLES.map((sample) => sample.id) as [SampleId, ...SampleId[]]

export const StartActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sample'), sampleId: z.enum(SAMPLE_IDS) }),
  z.object({ kind: z.literal('files'), files: z.array(z.instanceof(File)).min(1) }),
  z.object({ kind: z.literal('import'), text: z.string() }),
  z.object({ kind: z.literal('ask'), question: z.string().min(1) }),
  // The try demo; no sample (saved before the finance sample) is Global Sales.
  z.object({ kind: z.literal('try'), sampleId: z.enum(SAMPLE_IDS).optional() }),
])
export type StartAction = z.infer<typeof StartActionSchema>

const waiting = new Map<string, StartAction>()
/** Projects whose action is being taken: a second caller (strict mode) gets nothing. */
const taking = new Set<string>()
const startKey = (projectId: string) => projectKey(projectId, 'start')

/** Remembers `action` for project `projectId`; `persist` when the page will reload first. */
export async function queueStart(
  projectId: string,
  action: StartAction,
  { persist, store = idbStore }: { persist: boolean; store?: KeyValueStore },
): Promise<void> {
  waiting.set(projectId, action)
  if (persist) await store.set(startKey(projectId), action)
}

/** The action waiting for `projectId`, once: taking it removes it. */
export async function takeStart(
  projectId: string,
  { store = idbStore }: { store?: KeyValueStore } = {},
): Promise<StartAction | null> {
  if (taking.has(projectId)) return null
  taking.add(projectId)
  try {
    const local = waiting.get(projectId)
    waiting.delete(projectId)
    const saved = await store.get(startKey(projectId)).catch(() => undefined)
    if (saved !== undefined) await store.del(startKey(projectId)).catch(() => undefined)
    if (local) return local
    const parsed = StartActionSchema.safeParse(saved)
    return parsed.success ? parsed.data : null
  } finally {
    taking.delete(projectId)
  }
}
