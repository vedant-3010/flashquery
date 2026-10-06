import { describe, expect, it } from 'vitest'
import { buildContext } from '@/ai/context'
import fixtures from '@/ai/fixtures/global-sales.json'
import {
  columnFields,
  DEMO_QUESTION,
  DEMO_SQL,
  GROWTH,
  PAYLOAD_BALANCED,
  PAYLOAD_STRICT,
} from './data'
import { TOY_DATASET, TOY_SAMPLE } from './toyDataset'

// The landing page shows real things (PRD D99): the demo question's SQL, and the payloads the
// app's own context builder sends in each privacy mode.

describe('landing data', () => {
  it('shows the demo fixture question and SQL', () => {
    const fixture = (fixtures as { question: string; plan: { sql: string } }[]).find(
      (f) => f.question === DEMO_QUESTION,
    )
    expect(fixture?.plan.sql).toBe(DEMO_SQL)
  })

  it('shows the payloads src/ai/context.ts builds', () => {
    const samples = new Map([[TOY_DATASET.table, TOY_SAMPLE]])
    expect(buildContext({ datasets: [TOY_DATASET], mode: 'strict' }).tables[0]).toEqual(
      PAYLOAD_STRICT,
    )
    expect(buildContext({ datasets: [TOY_DATASET], mode: 'balanced', samples }).tables[0]).toEqual(
      PAYLOAD_BALANCED,
    )
  })

  it('marks the fields Strict mode leaves out', () => {
    const [date] = columnFields()
    expect(date?.filter((f) => !f.strict).map((f) => f.key)).toEqual([
      'nullPct',
      'distinct',
      'min',
      'max',
    ])
  })

  it('has growth sorted fastest first, APAC on top', () => {
    expect(GROWTH.map((g) => g.growth)).toEqual(
      [...GROWTH.map((g) => g.growth)].sort((a, b) => b - a),
    )
    expect(GROWTH[0]?.region).toBe('APAC')
  })
})
