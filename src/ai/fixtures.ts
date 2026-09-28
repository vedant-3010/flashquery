import { z } from 'zod'
import rawFixtures from '@/ai/fixtures/global-sales.json'
import { SqlPlanSchema, type SqlPlan } from '@/ai/schemas'
import { GLOBAL_SALES_TABLE } from '@/engine/samples'

// Demo mode (F-AI-03): curated questions about the Global Sales sample, stored as SqlPlans only.
// The SQL runs live on the generated data, so every number matches what the user sees.

const FixtureSchema = z.object({
  question: z.string(),
  aliases: z.array(z.string()),
  plan: SqlPlanSchema,
})
export type Fixture = z.infer<typeof FixtureSchema>

export const DEMO_TABLE = GLOBAL_SALES_TABLE
export const DEMO_FIXTURES: Fixture[] = z.array(FixtureSchema).parse(rawFixtures)

/** Lowercase, no punctuation, single spaces: "Which region grew fastest?" → "which region grew fastest". */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const index = new Map<string, Fixture>()
for (const fixture of DEMO_FIXTURES) {
  for (const text of [fixture.question, ...fixture.aliases]) {
    index.set(normalizeQuestion(text), fixture)
  }
}

export function matchFixture(question: string): SqlPlan | null {
  return index.get(normalizeQuestion(question))?.plan ?? null
}
