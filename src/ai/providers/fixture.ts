import { DEMO_SETS, demoDashboard, demoSetsFor, matchFixture } from '@/ai/fixtures'
import type { LLMProvider } from '@/ai/providers'
import { AppError } from '@/lib/errors'

// Demo mode (F-AI-03): answers the curated questions about the samples (Global Sales, Company
// finances) from recorded plans. Nothing is sent anywhere; the SQL still runs live through the
// guard on the user's device.

const SAMPLE_NAMES = DEMO_SETS.map((set) => set.label).join(' or ')

export const fixtureProvider: LLMProvider = {
  id: 'fixture',
  model: 'demo',
  remote: false,
  // Demo mode summarizes locally (ai.md): no summarize().
  summaryModel: null,
  async planSql({ question, tables }) {
    if (demoSetsFor(tables).length === 0) {
      throw new AppError({
        code: 'demo_needs_sample',
        message: `Demo answers work on the sample data (${SAMPLE_NAMES}). Load one, or add an AI key to ask about your own data.`,
        detail: null,
      })
    }
    const plan = matchFixture(question, tables)
    if (!plan) {
      throw new AppError({
        code: 'demo_unmatched',
        message:
          'Demo mode answers a set of example questions. Pick one below, or add an AI key to ask anything.',
        detail: null,
      })
    }
    return { plan, usage: null }
  },
  async planDashboard({ table }) {
    const plan = demoDashboard(table)
    if (!plan) {
      throw new AppError({
        code: 'demo_needs_sample',
        message: `Demo mode can build a dashboard for the sample data (${SAMPLE_NAMES}). Add an AI key to build one for your own data.`,
        detail: null,
      })
    }
    return { plan, usage: null }
  },
  async testConnection() {},
}
