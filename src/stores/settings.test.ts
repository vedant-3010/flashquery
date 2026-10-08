import { describe, expect, it } from 'vitest'
import { LOCAL_NO_KEY } from '@/ai/localServer'
import { loadRecord, memoryStore } from '@/lib/idb'
import { activeApiKey, SETTINGS_RECORD } from './settings'

// Settings v5 (F-AI-06): a local OpenAI-compatible server needs a localhost URL and a model, no key.
// Settings v6 (F-ASK-16): the planner's effort, chosen in the ask bar. v7 (F-VIZ-12): chart colors.

const keys = { anthropic: null, openai: null, local: null }
const models = { anthropic: 'claude-sonnet-5', openai: 'gpt-6-sol', local: 'qwen2.5-coder:7b' }

describe('settings', () => {
  it('migrates v4 settings to v5 with the local server defaults', async () => {
    const v4 = {
      provider: 'openai',
      models: { anthropic: 'claude-sonnet-5', openai: 'gpt-6-sol' },
      privacyMode: 'strict',
      dateDisplay: 'iso',
      rememberKey: true,
      apiKeys: { anthropic: null, openai: 'sk-test-key' },
      numberLocale: null,
      currency: 'EUR',
      autoRunPython: false,
      tourDone: true,
    }
    const store = memoryStore({ settings: { version: 4, savedAt: 0, data: v4 } })
    const saved = await loadRecord(SETTINGS_RECORD, { store })
    expect(saved).toMatchObject({
      provider: 'openai',
      privacyMode: 'strict',
      apiKeys: { openai: 'sk-test-key', local: null },
      models: { local: 'qwen2.5-coder:7b' },
      baseUrl: 'http://localhost:11434/v1',
      persistFiles: false,
      effort: 'medium',
      chartPalette: 'flashquery',
    })
  })

  it('migrates v5 settings to v6 keeping the effort they had (medium)', async () => {
    const v5 = {
      provider: 'anthropic',
      models,
      baseUrl: 'http://localhost:11434/v1',
      privacyMode: 'balanced',
      dateDisplay: 'iso',
      rememberKey: false,
      apiKeys: keys,
      numberLocale: null,
      currency: null,
      autoRunPython: false,
      tourDone: true,
      persistFiles: false,
    }
    const store = memoryStore({ settings: { version: 5, savedAt: 0, data: v5 } })
    expect(await loadRecord(SETTINGS_RECORD, { store })).toEqual({
      ...v5,
      effort: 'medium',
      chartPalette: 'flashquery',
    })
  })

  it('treats a local server as ready with a localhost URL and a model', () => {
    const local = { provider: 'local' as const, apiKeys: keys, models }
    expect(activeApiKey({ ...local, baseUrl: 'http://localhost:11434/v1' })).toBe(LOCAL_NO_KEY)
    expect(activeApiKey({ ...local, baseUrl: 'https://api.example.com/v1' })).toBeNull()
    expect(
      activeApiKey({
        ...local,
        baseUrl: 'http://localhost:1234/v1',
        models: { ...models, local: '' },
      }),
    ).toBeNull()
    expect(
      activeApiKey({
        ...local,
        apiKeys: { ...keys, local: 'lm-key' },
        baseUrl: 'http://127.0.0.1:1234/v1',
      }),
    ).toBe('lm-key')
    expect(activeApiKey({ ...local, provider: 'anthropic', baseUrl: '' })).toBeNull()
  })
})
