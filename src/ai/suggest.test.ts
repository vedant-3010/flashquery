// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import type { AiLogEntry } from '@/ai/log'
import type { LLMProvider } from '@/ai/providers'
import type { Engine } from '@/engine/connection'
import { createTestEngine } from '@/test/duckdb'
import { loadEvalDatasets } from '@/test/evalData'
import type { DatasetProfile } from '@/engine/types'
import { cleanQuestions, suggestionKey, suggestWithAi } from './suggest'

// F-PROF-04: suggestions come from the Balanced context, are cleaned, and are logged.

let engine: Engine
let sales: DatasetProfile

beforeAll(async () => {
  engine = await createTestEngine()
  const datasets = await loadEvalDatasets(engine)
  const found = datasets.get('global_sales')
  if (!found) throw new Error('global_sales missing')
  sales = found
}, 60_000)

describe('AI-suggested questions', () => {
  it('sends the delimited Balanced context and logs the request', async () => {
    const sent: string[] = []
    const provider = {
      id: 'anthropic',
      model: 'claude-sonnet-5',
      remote: true,
      summaryModel: 'claude-haiku-4-5-20251001',
      async suggestQuestions({ messages }) {
        sent.push(...messages.map((m) => m.content))
        return {
          questions: ['Revenue by region', ' revenue by  region ', 'Top 5 products by units'],
          usage: { inputTokens: 900, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
        }
      },
    } as Partial<LLMProvider> as LLMProvider
    const log: AiLogEntry[] = []
    const questions = await suggestWithAi({
      provider,
      runner: engine,
      datasets: [sales],
      signal: new AbortController().signal,
      onLog: (entry) => log.push(entry),
    })
    expect(questions).toEqual(['Revenue by region', 'Top 5 products by units'])
    expect(sent.join('\n')).toMatch(/<data>[\s\S]*sampleRows[\s\S]*<\/data>/)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      purpose: 'suggest',
      model: 'claude-haiku-4-5-20251001',
      mode: 'balanced',
    })
    expect(log[0]?.dataValues).toBeGreaterThan(0)
  })

  it('keys the cache by schema, in any order', () => {
    const a = { schemaHash: 'b1' } as DatasetProfile
    const b = { schemaHash: 'a2' } as DatasetProfile
    expect(suggestionKey([a, b])).toBe(suggestionKey([b, a]))
    expect(cleanQuestions(['', 'x', 'X', 'y', 'z', 'w', 'v', 'u', 't'])).toEqual([
      'x',
      'y',
      'z',
      'w',
      'v',
      'u',
    ])
  })
})
