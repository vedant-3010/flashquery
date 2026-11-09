import { describe, expect, it } from 'vitest'
import { withoutSecrets } from '@/stores/persistence'

// The backup of an unreadable record (F-EXP-02) lands in Downloads in plain text: never with a
// saved AI key in it (D124).

describe('withoutSecrets', () => {
  it('blanks every saved key, keeping the rest of the record', () => {
    const settings = {
      version: 8,
      data: {
        provider: 'anthropic',
        rememberKey: true,
        apiKeys: { anthropic: 'sk-ant-api03-not-a-real-key', openai: null, openrouter: 'sk-or-x' },
      },
    }
    expect(withoutSecrets(settings)).toEqual({
      version: 8,
      data: {
        provider: 'anthropic',
        rememberKey: true,
        apiKeys: { anthropic: null, openai: null, openrouter: null },
      },
    })
    expect(withoutSecrets([{ apiKeys: { local: 'x' } }, 'text', 3])).toEqual([
      { apiKeys: { local: null } },
      'text',
      3,
    ])
  })
})
