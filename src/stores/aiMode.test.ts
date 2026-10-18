import { describe, expect, it } from 'vitest'
import { aiModeOf } from '@/stores/aiMode'

// Who answers (F-PLAN-01): HushGlance AI, the user's own key, or the demo.

const base = {
  provider: 'anthropic' as const,
  baseUrl: '',
  models: {
    anthropic: 'claude-sonnet-5',
    openai: 'gpt-6-sol',
    openrouter: 'anthropic/claude-sonnet-5',
    local: '',
  },
  apiKeys: { anthropic: null, openai: null, openrouter: null, local: null },
}
const keyed = { ...base, apiKeys: { ...base.apiKeys, anthropic: 'sk-ant-key-123456' } }

describe('aiModeOf', () => {
  it('hosts a signed-in user who chose HushGlance AI, where it’s offered', () => {
    expect(aiModeOf({ ...base, aiSource: 'hosted' }, 'signed-in', true)).toBe('hosted')
    expect(aiModeOf({ ...keyed, aiSource: 'hosted' }, 'signed-in', true)).toBe('hosted')
  })

  it('uses the own key otherwise, and the demo without one', () => {
    expect(aiModeOf({ ...keyed, aiSource: 'own' }, 'signed-in', true)).toBe('own')
    expect(aiModeOf({ ...base, aiSource: 'own' }, 'signed-in', true)).toBe('demo')
    expect(aiModeOf({ ...base, aiSource: 'hosted' }, 'guest', true)).toBe('demo')
    expect(aiModeOf({ ...keyed, aiSource: 'hosted' }, 'guest', true)).toBe('own')
    // Not offered here (no hosted models, or offline): as before M16.
    expect(aiModeOf({ ...base, aiSource: 'hosted' }, 'signed-in', false)).toBe('demo')
    expect(aiModeOf({ ...keyed, aiSource: 'hosted' }, 'signed-in', false)).toBe('own')
  })
})
