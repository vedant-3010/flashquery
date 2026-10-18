import { describe, expect, it } from 'vitest'
import { memoryStore, type Envelope, type KeyValueStore, type RecordSpec } from '@/lib/idb'
import type { RemovedProject } from '@/lib/syncMerge'
import { createVault, decryptRecord, recordAad } from '@/lib/vault'
import type { RemoteRecord } from '@/platform/vault'
import { DASHBOARDS_RECORD } from '@/stores/dashboard'
import { HISTORY_RECORD } from '@/stores/history'
import { PERSISTED_RECORD } from '@/stores/keptDatasets'
import { NOTES_RECORD } from '@/stores/notes'
import { projectKey, type PROJECT_RECORD_KEYS } from '@/stores/projectScope'
import { newProject, type Project } from '@/stores/projects'
import { SUGGESTIONS_RECORD } from '@/stores/suggestions'
import { SyncEngine, type SyncRemote } from '@/stores/syncEngine'
import { newMeta, remoteName } from '@/stores/syncMeta'

// The account sync (M17, F-SYNC-02/03) between two devices and a fake account service that keeps
// what a real one would: versioned ciphertext.

const USER = '00000000-0000-0000-0000-0000000000a1'
const SPECS: Record<(typeof PROJECT_RECORD_KEYS)[number], RecordSpec<unknown>> = {
  history: HISTORY_RECORD,
  dashboards: DASHBOARDS_RECORD,
  notes: NOTES_RECORD,
  suggestions: SUGGESTIONS_RECORD,
  persistedDatasets: PERSISTED_RECORD,
}

function fakeAccount() {
  const rows = new Map<string, RemoteRecord>()
  const bodies: string[] = []
  const deletedFiles: string[] = []
  let clock = 0
  const stamp = () => new Date(Date.UTC(2026, 9, 16, 0, 0, (clock += 1))).toISOString()
  const remote: SyncRemote = {
    putRecord: async (scope, key, expected, sealed) => {
      bodies.push(sealed)
      const name = `${scope}/${key}`
      const row = rows.get(name)
      if ((row?.version ?? 0) !== expected) return null
      const version = expected + 1
      rows.set(name, { scope, key, version, ciphertext: sealed, updatedAt: stamp() })
      return version
    },
    getRecord: async (scope, key) => rows.get(`${scope}/${key}`) ?? null,
    pullChanges: async (since) =>
      [...rows.values()]
        .filter((row) => since === null || row.updatedAt >= since)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .map((row) => ({
          scope: row.scope,
          key: row.key,
          version: row.version,
          updatedAt: row.updatedAt,
        })),
    deleteRecords: async (scope) => {
      for (const [name, row] of rows) if (row.scope === scope) rows.delete(name)
    },
    deleteFile: async (fileId) => void deletedFiles.push(fileId),
  }
  return { remote, rows, bodies, deletedFiles }
}

/** One device: its records, its project list, and its engine. */
function device(remote: SyncRemote, key: CryptoKey, projects: Project[] = []) {
  const store: KeyValueStore = memoryStore()
  const state = { projects, removed: [] as RemovedProject[] }
  const changed: string[] = []
  const engine = new SyncEngine({
    remote,
    key,
    store,
    meta: newMeta(USER, '2026-10-16T00:00:00Z'),
    specs: SPECS,
    host: {
      projects: () => state,
      neverSyncs: (id) => id.startsWith('try-'),
      applyProjects: async (next, removed, deleted) => {
        state.projects = next
        state.removed = removed
        for (const id of deleted) {
          for (const k of await store.keys()) if (k.startsWith(`p:${id}:`)) await store.del(k)
        }
      },
      changedElsewhere: (projectId, k) => void changed.push(`${projectId}/${k}`),
    },
  })
  const save = async (localKey: string, data: unknown, savedAt = Date.now(), version = 1) => {
    const envelope: Envelope = { version, savedAt, data }
    await store.set(localKey, envelope)
    engine.changed(localKey)
  }
  return { store, state, engine, changed, save }
}

const question = (text: string, at: number) => ({
  id: `h_${at}`,
  kind: 'question' as const,
  text,
  sql: 'SELECT 1',
  status: 'answered' as const,
  headline: null,
  rowCount: 1,
  at,
})

async function setUp() {
  const { dataKey } = await createVault('correct horse battery', { iterations: 1_000 })
  const account = fakeAccount()
  const project = { ...newProject('Quarterly numbers'), id: 'p_abc12345' }
  const a = device(account.remote, dataKey, [project])
  const b = device(account.remote, dataKey)
  return { account, project, a, b, dataKey }
}

describe('remoteName', () => {
  it('maps the records that sync, and nothing else', () => {
    expect(remoteName('projects')).toEqual({ scope: 'global', key: 'projects' })
    expect(remoteName('removedProjects')).toEqual({ scope: 'global', key: 'projects' })
    expect(remoteName('p:p_1:history')).toEqual({ scope: 'p_1', key: 'history' })
    expect(remoteName('settings')).toBeNull()
    expect(remoteName('syncMeta')).toBeNull()
    expect(remoteName('p:p_1:somethingElse')).toBeNull()
  })
})

describe('SyncEngine', () => {
  it('brings a project and its questions to another device, encrypted on the way', async () => {
    const { account, project, a, b } = await setUp()
    await a.save(projectKey(project.id, 'history'), [question('Which region grew fastest?', 1)])
    await a.engine.scan()
    await a.engine.sync()

    await b.engine.sync()
    expect(b.state.projects.map((p) => p.name)).toEqual(['Quarterly numbers'])
    expect(await b.store.get(projectKey(project.id, 'history'))).toMatchObject({
      data: [{ text: 'Which region grew fastest?' }],
    })
    expect(b.changed).toContain(`${project.id}/history`)

    // The canary: the account only ever saw ciphertext.
    const sent = account.bodies.map((body) => atob(body)).join('\n')
    expect(sent).not.toContain('Which region')
    expect(sent).not.toContain('Quarterly')
  })

  it('keeps the later save when two devices change the same record', async () => {
    const { project, a, b } = await setUp()
    const history = projectKey(project.id, 'history')
    await a.engine.scan()
    await a.engine.sync()
    await b.engine.sync()

    await a.save(history, [question('From A', 1)], 1_000)
    await b.save(history, [question('From B, later', 2)], 2_000)
    await a.engine.flush()
    // B's save is refused (A got there first), B pulls A's, keeps its own later one and saves it.
    await b.engine.flush()
    await a.engine.sync()
    expect(await a.store.get(history)).toMatchObject({ data: [{ text: 'From B, later' }] })

    // An older save from another device doesn't replace a newer one here.
    await a.save(history, [question('A again, newest', 3)], 5_000)
    await b.save(history, [question('B, stale', 4)], 4_000)
    await a.engine.flush()
    await b.engine.flush()
    expect(await b.store.get(history)).toMatchObject({ data: [{ text: 'A again, newest' }] })
  })

  it('never sends a local-only project or a try project', async () => {
    const { account, project, a, dataKey } = await setUp()
    const privateOne = { ...newProject('Payroll'), id: 'p_private1', localOnly: true }
    const tryOne = { ...newProject('Sample: Global Sales'), id: 'try-global-sales' }
    a.state.projects = [...a.state.projects, privateOne, tryOne]
    await a.save(projectKey(privateOne.id, 'history'), [question('Salaries by team', 1)])
    await a.save(projectKey(tryOne.id, 'history'), [question('Demo question', 1)])
    await a.engine.scan()
    await a.engine.sync()
    expect([...account.rows.keys()]).toEqual(['global/projects'])
    const row = account.rows.get('global/projects')
    if (!row) throw new Error('no project list')
    const list = await decryptRecord(
      dataKey,
      row.ciphertext,
      recordAad(USER, 'global', 'projects', row.version),
    )
    expect(list).toMatchObject({ data: { projects: [{ id: project.id }], removed: [] } })
    expect(JSON.stringify(list)).not.toContain('Payroll')
  })

  it('removes a deleted project everywhere, with its records and files', async () => {
    const { account, project, a, b } = await setUp()
    await a.save(projectKey(project.id, 'history'), [question('Q', 1)])
    await a.save(
      projectKey(project.id, 'persistedDatasets'),
      [
        {
          id: 'ds_1',
          table: 'sales',
          label: 'sales.csv',
          fileName: 'sales.csv',
          stored: true,
          input: { kind: 'file', format: 'csv', csv: null },
          ignoreErrors: false,
          overrides: [],
          savedAt: 1,
          cloud: { fileId: 'p_abc12345-ds_1-1', bytes: 100, chunks: 1 },
        },
      ],
      Date.now(),
      PERSISTED_RECORD.version,
    )
    await a.engine.scan()
    await a.engine.sync()
    await b.engine.sync()
    expect(b.state.projects).toHaveLength(1)

    // A deletes it.
    a.state.projects = []
    a.state.removed = [{ id: project.id, at: Date.now() + 1, kind: 'deleted' }]
    a.engine.changed('removedProjects')
    a.engine.forgetProject(project.id)
    await a.engine.sync()
    expect([...account.rows.keys()]).toEqual(['global/projects'])
    expect(account.deletedFiles).toEqual(['p_abc12345-ds_1-1'])

    await b.engine.sync()
    expect(b.state.projects).toEqual([])
    expect(await b.store.keys()).not.toContain(projectKey(project.id, 'history'))
  })

  it('merges projects made on both devices instead of overwriting the list', async () => {
    const { project, a, b } = await setUp()
    await a.engine.scan()
    await a.engine.sync()
    b.state.projects = [{ ...newProject('Made on B'), id: 'p_bbbbbbbb' }]
    await b.engine.scan()
    await b.engine.sync()
    await a.engine.sync()
    expect(a.state.projects.map((p) => p.id).sort()).toEqual([project.id, 'p_bbbbbbbb'].sort())
    expect(b.state.projects.map((p) => p.id).sort()).toEqual([project.id, 'p_bbbbbbbb'].sort())
  })

  it('refuses records encrypted with another key', async () => {
    const { account, project, a } = await setUp()
    await a.engine.scan()
    await a.engine.sync()
    const stranger = device(
      account.remote,
      (await createVault('other', { iterations: 1_000 })).dataKey,
    )
    await expect(stranger.engine.sync()).rejects.toMatchObject({ code: 'vault_tampered' })
    expect(stranger.state.projects).toEqual([])
    void project
  })
})
