import { z } from '@/lib/zod'
import rawFinanceDashboard from '@/ai/fixtures/company-finances-dashboard.json'
import rawFinance from '@/ai/fixtures/company-finances.json'
import rawSalesDashboard from '@/ai/fixtures/global-sales-dashboard.json'
import rawSales from '@/ai/fixtures/global-sales.json'
import { DashboardPlanSchema, SqlPlanSchema, type DashboardPlan, type SqlPlan } from '@/ai/schemas'
import { COMPANY_FINANCES_TABLE, GLOBAL_SALES_TABLE, type SampleId } from '@/engine/samples'

// Demo mode (F-AI-03): curated questions about the samples, stored as SqlPlans only, one set per
// sample (D117: Global Sales, and Company finances for finance people). The SQL runs live on the
// sample, so every number matches what the user sees.

const FixtureSchema = z.object({
  question: z.string(),
  aliases: z.array(z.string()),
  plan: SqlPlanSchema,
})
export type Fixture = z.infer<typeof FixtureSchema>

/** One sample's demo answers: its questions and the dashboard "Generate" builds. */
export interface DemoSet {
  sampleId: SampleId
  table: string
  /** How the sample is named to people: "Load Global Sales". */
  label: string
  fixtures: Fixture[]
  dashboard: DashboardPlan
}

/** The sales demo: the landing page's headline question and /app/try. */
export const SALES_DEMO: DemoSet = {
  sampleId: 'global-sales-1m',
  table: GLOBAL_SALES_TABLE,
  label: 'Global Sales',
  fixtures: z.array(FixtureSchema).parse(rawSales),
  dashboard: DashboardPlanSchema.parse(rawSalesDashboard),
}

/** The finance demo (D117): receivables, margins, spend and cash. */
export const FINANCE_DEMO: DemoSet = {
  sampleId: 'company-finances',
  table: COMPANY_FINANCES_TABLE,
  label: 'Company finances',
  fixtures: z.array(FixtureSchema).parse(rawFinance),
  dashboard: DashboardPlanSchema.parse(rawFinanceDashboard),
}

export const DEMO_SETS: readonly DemoSet[] = [SALES_DEMO, FINANCE_DEMO]

/** Lowercase, no punctuation, single spaces: "Which region grew fastest?" → "which region grew fastest". */
export function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const index = new Map<string, { set: DemoSet; fixture: Fixture }>()
for (const set of DEMO_SETS) {
  for (const fixture of set.fixtures) {
    for (const text of [fixture.question, ...fixture.aliases]) {
      index.set(normalizeQuestion(text), { set, fixture })
    }
  }
}

/** The demo sets whose sample is loaded. */
export function demoSetsFor(tables: readonly string[]): DemoSet[] {
  return DEMO_SETS.filter((set) => tables.includes(set.table))
}

/** The questions demo mode can answer with these tables loaded, each set in order. */
export function demoQuestions(tables: readonly string[]): string[] {
  return demoSetsFor(tables).flatMap((set) => set.fixtures.map((fixture) => fixture.question))
}

/** The recorded answer to `question`; only from a loaded sample when `tables` is given. */
export function matchFixture(question: string, tables?: readonly string[]): SqlPlan | null {
  const found = index.get(normalizeQuestion(question))
  if (!found || (tables && !tables.includes(found.set.table))) return null
  return found.fixture.plan
}

/** The dashboard demo mode builds for a sample's table (docs/PRD.md §9, fixture 13). */
export function demoDashboard(table: string): DashboardPlan | null {
  return DEMO_SETS.find((set) => set.table === table)?.dashboard ?? null
}
