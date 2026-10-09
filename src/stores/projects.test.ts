import { describe, expect, it } from 'vitest'
import { memoryStore } from '@/lib/idb'
import { inProject, projectKey, projectScope, setProjectScope } from '@/stores/projectScope'
import {
  FIRST_PROJECT_ID,
  migrateLegacyData,
  newProject,
  nextName,
  PROJECTS_RECORD,
} from '@/stores/projects'
import { queueStart, takeStart } from '@/stores/projectStart'
import { loadRecentQuestions } from '@/stores/recentQuestions'

// F-HOME-02: projects, the v1 → projects migration, recent questions and start actions.

const envelope = (data: unknown) => ({ version: 1, savedAt: 1, data })
const question = (text: string, at: number) => ({
  id: `h_${at}`,
  kind: 'question',
  text,
  sql: 'SELECT 1',
  status: 'answered',
  headline: null,
  rowCount: 1,
  at,
})

describe('migrating v1 data into "My first project"', () => {
  it('moves every v1 record as saved, counts it on the card, and removes the old keys', async () => {
    const store = memoryStore({
      history: envelope([question('Which region grew fastest?', 5), question('Total', 6)]),
      dashboards: envelope({ dashboards: [], activeId: null }),
      notes: envelope({}),
      settings: envelope({ kept: 'global' }),
      evalCases: envelope([]),
    })
    const projects = await migrateLegacyData(store)
    expect(projects).toEqual([
      expect.objectContaining({
        id: FIRST_PROJECT_ID,
        name: 'My first project',
        questions: 2,
        dashboards: 0,
        datasets: [],
      }),
    ])
    const keys = await store.keys()
    expect(keys).toEqual(
      expect.arrayContaining([
        projectKey(FIRST_PROJECT_ID, 'history'),
        projectKey(FIRST_PROJECT_ID, 'dashboards'),
        projectKey(FIRST_PROJECT_ID, 'notes'),
        'projects',
        'settings',
        'evalCases',
      ]),
    )
    expect(keys).not.toContain('history')
    expect(await store.get(projectKey(FIRST_PROJECT_ID, 'history'))).toMatchObject({
      data: [{ text: 'Which region grew fastest?' }, { text: 'Total' }],
    })
    expect(await store.get(PROJECTS_RECORD.key)).toMatchObject({ data: [{ id: FIRST_PROJECT_ID }] })
  })

  it('does nothing for a new user', async () => {
    const store = memoryStore({ settings: envelope({}) })
    expect(await migrateLegacyData(store)).toBeNull()
    expect(await store.keys()).toEqual(['settings'])
  })

  it('can run again after being cut short (same project id)', async () => {
    const store = memoryStore({ history: envelope([question('Again', 1)]) })
    // A first run copied the record but stopped before saving the list.
    await store.set(projectKey(FIRST_PROJECT_ID, 'history'), envelope([question('Again', 1)]))
    const projects = await migrateLegacyData(store)
    expect(projects?.map((p) => p.id)).toEqual([FIRST_PROJECT_ID])
    expect((await store.keys()).filter((key) => key.startsWith('p:'))).toHaveLength(1)
  })
})

describe('projects', () => {
  it('names new projects without clashing', () => {
    expect(nextName([])).toBe('Untitled project')
    expect(nextName([{ name: 'Untitled project' }, { name: 'Untitled project 2' }])).toBe(
      'Untitled project 3',
    )
    expect(newProject('  Q3 review  ', 7)).toMatchObject({
      name: 'Q3 review',
      createdAt: 7,
      lastOpenedAt: 7,
    })
    expect(newProject('   ').name).toBe('Untitled project')
    expect(newProject('x'.repeat(200)).name).toHaveLength(80)
  })

  it('lists recent questions across projects, newest first, once each', async () => {
    const store = memoryStore({
      [projectKey('a', 'history')]: envelope([
        question('Revenue by year', 30),
        question('revenue by year ', 10),
        { ...question('SELECT 1', 40), kind: 'query' },
      ]),
      [projectKey('b', 'history')]: envelope([question('Top products', 20)]),
      [projectKey('c', 'history')]: 'not a record',
    })
    const recent = await loadRecentQuestions(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      { store },
    )
    expect(recent.map((r) => [r.projectName, r.question])).toEqual([
      ['A', 'Revenue by year'],
      ['B', 'Top products'],
    ])
    // Reading from Home never resets another project's record.
    expect(await store.get(projectKey('c', 'history'))).toBe('not a record')
  })
})

describe('start actions', () => {
  it('hands an action over once, from memory or from a saved copy after a reload', async () => {
    const store = memoryStore()
    await queueStart('p1', { kind: 'ask', question: 'Hi' }, { persist: false, store })
    expect(await takeStart('p1', { store })).toEqual({ kind: 'ask', question: 'Hi' })
    expect(await takeStart('p1', { store })).toBeNull()

    await queueStart('p2', { kind: 'try' }, { persist: true, store })
    expect(await store.get(projectKey('p2', 'start'))).toEqual({ kind: 'try' })
    expect(await takeStart('p2', { store })).toEqual({ kind: 'try' })
    expect(await store.get(projectKey('p2', 'start'))).toBeUndefined()
  })

  it('ignores a saved action it does not recognize', async () => {
    const store = memoryStore({ [projectKey('p3', 'start')]: { kind: 'launch' } })
    expect(await takeStart('p3', { store })).toBeNull()
  })
})

describe('project scope', () => {
  it('keeps project data under the open project, and refuses another one', () => {
    expect(projectScope()).toBeNull()
    expect(() => inProject(PROJECTS_RECORD)).toThrow(/no project is open/)
    setProjectScope('p_1')
    expect(inProject({ ...PROJECTS_RECORD, key: 'history' }).key).toBe('p:p_1:history')
    expect(() => setProjectScope('p_2')).toThrow(/another project/)
  })
})
