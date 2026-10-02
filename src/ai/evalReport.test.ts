import { describe, expect, it } from 'vitest'
import { accuracy, renderReport, type EvalResult } from './evalReport'

const result = (id: string, outcome: EvalResult['outcome'], dataset = 'global_sales') => ({
  id,
  dataset,
  question: `Question ${id}?`,
  outcome,
  reason: outcome === 'pass' ? null : '3 rows, expected 5',
  sql: outcome === 'pass' ? null : 'SELECT 1',
  attempts: 1,
  tokens: 1000,
  cost: 0.004,
  ms: 2500,
})

describe('eval report (F-QA-04)', () => {
  it('summarizes accuracy per dataset and lists failures', () => {
    const results = [
      result('a', 'pass'),
      result('b', 'wrong_result'),
      result('c', 'pass', 'hr_attrition'),
    ]
    expect(accuracy(results)).toBeCloseTo(2 / 3)
    const report = renderReport(results, {
      model: 'claude-sonnet-5',
      provider: 'Anthropic',
      mode: 'balanced',
      rows: 10_000,
      date: '2026-10-02',
    })
    expect(report).toContain('**Execution accuracy: 2/3 (66.7%)**')
    expect(report).toContain('| global_sales | 1/2 | 50.0% |')
    expect(report).toContain('| Wrong result | 1 |')
    expect(report).toContain('### b: Question b?')
    expect(report).toContain('3,000 tokens, ≈ $0.01')
  })
})
