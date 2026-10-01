import { DEMO_DASHBOARD, DEMO_FIXTURES, DEMO_TABLE, matchFixture } from '@/ai/fixtures'
import type { LLMProvider } from '@/ai/providers'
import { AppError } from '@/lib/errors'

// Demo mode (F-AI-03): answers the curated Global Sales questions from recorded plans. Nothing is
// sent anywhere; the SQL still runs live through the guard on the user's device.

export const DEMO_QUESTIONS = DEMO_FIXTURES.map((fixture) => fixture.question)

export const fixtureProvider: LLMProvider = {
  id: 'fixture',
  model: 'demo',
  remote: false,
  // Demo mode summarizes locally (ai.md): no summarize().
  summaryModel: null,
  async planSql({ question, tables }) {
    if (!tables.includes(DEMO_TABLE)) {
      throw new AppError({
        code: 'demo_needs_sample',
        message:
          'Demo answers work on the Global Sales sample. Load it from "Try sample data", or add an API key to ask about your own data.',
        detail: null,
      })
    }
    const plan = matchFixture(question)
    if (!plan) {
      throw new AppError({
        code: 'demo_unmatched',
        message:
          'Demo mode only knows a few questions. Pick one below, or add an API key to ask anything.',
        detail: null,
      })
    }
    return { plan, usage: null }
  },
  async planDashboard({ table }) {
    if (table !== DEMO_TABLE) {
      throw new AppError({
        code: 'demo_needs_sample',
        message:
          'Demo mode can build a dashboard for the Global Sales sample. Add an API key to build one for your own data.',
        detail: null,
      })
    }
    return { plan: DEMO_DASHBOARD, usage: null }
  },
  async testConnection() {},
}
