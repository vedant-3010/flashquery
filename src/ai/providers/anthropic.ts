import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage } from '@langchain/core/messages'
import { FAST_MODEL, requestEffort } from '@/ai/models'
import type { LLMProvider, ProviderSettings } from '@/ai/providers'
import { TEST_PROMPT } from '@/ai/prompts/testConnection'
import { providerError, toLangChainMessages, usageOf } from '@/ai/providers/langchain'
import {
  AnswerSummarySchema,
  DashboardPlanSchema,
  SqlPlanSchema,
  SuggestedQuestionsSchema,
} from '@/ai/schemas'

// Claude through LangChain (PRD D6), called from the browser with the user's own key (BYOK, D3).
// Structured output uses native JSON outputs (output_config.format, `method: "jsonSchema"`): it
// works with adaptive thinking, which Sonnet 5 runs by default, unlike forced tool calls (D29).

const MAX_TOKENS = 16_000
const SUMMARY_MAX_TOKENS = 2_000

export function createAnthropicProvider({
  apiKey,
  model,
  effort: chosen = 'medium',
  fetch,
}: ProviderSettings): LLMProvider {
  const effort = requestEffort(model, chosen)
  const chat = new ChatAnthropic({
    apiKey,
    model,
    maxTokens: MAX_TOKENS,
    // LangChain retries (the SDK client it builds has retries off); its default of 6 with backoff
    // would keep a rate-limited user waiting for minutes.
    maxRetries: 2,
    // Intentional: the user's own key, in their own browser (BYOK). See CLAUDE.md gotchas.
    clientOptions: { dangerouslyAllowBrowser: true, ...(fetch ? { fetch } : {}) },
    ...(effort ? { outputConfig: { effort } } : {}),
  })
  const planner = chat.withStructuredOutput(SqlPlanSchema, {
    name: 'sql_plan',
    method: 'jsonSchema',
    includeRaw: true,
  })
  const dashboardPlanner = chat.withStructuredOutput(DashboardPlanSchema, {
    name: 'dashboard_plan',
    method: 'jsonSchema',
    includeRaw: true,
  })
  // Summaries use the fast model: a few sentences about ≤ 50 rows (F-ASK-12, PRD D41).
  const summaryModel = FAST_MODEL.anthropic
  const summaryEffort = requestEffort(summaryModel, 'low')
  const fast = new ChatAnthropic({
    apiKey,
    model: summaryModel,
    maxTokens: SUMMARY_MAX_TOKENS,
    maxRetries: 2,
    clientOptions: { dangerouslyAllowBrowser: true, ...(fetch ? { fetch } : {}) },
    ...(summaryEffort ? { outputConfig: { effort: summaryEffort } } : {}),
  })
  const summarizer = fast.withStructuredOutput(AnswerSummarySchema, {
    name: 'answer_summary',
    method: 'jsonSchema',
    includeRaw: true,
  })
  const suggester = fast.withStructuredOutput(SuggestedQuestionsSchema, {
    name: 'suggested_questions',
    method: 'jsonSchema',
    includeRaw: true,
  })

  return {
    id: 'anthropic',
    model,
    remote: true,
    effort,
    summaryEffort,
    async planSql({ messages, signal }) {
      try {
        const result = await planner.invoke(toLangChainMessages(messages, { cacheControl: true }), {
          signal,
        })
        return { plan: SqlPlanSchema.parse(result.parsed), usage: usageOf(result.raw) }
      } catch (error) {
        throw providerError(error, model, signal)
      }
    },
    async planDashboard({ messages, signal }) {
      try {
        const result = await dashboardPlanner.invoke(
          toLangChainMessages(messages, { cacheControl: true }),
          { signal },
        )
        return { plan: DashboardPlanSchema.parse(result.parsed), usage: usageOf(result.raw) }
      } catch (error) {
        throw providerError(error, model, signal)
      }
    },
    summaryModel,
    async summarize({ messages, signal }) {
      try {
        const result = await summarizer.invoke(
          toLangChainMessages(messages, { cacheControl: false }),
          { signal },
        )
        return { summary: AnswerSummarySchema.parse(result.parsed), usage: usageOf(result.raw) }
      } catch (error) {
        throw providerError(error, summaryModel, signal)
      }
    },
    async suggestQuestions({ messages, signal }) {
      try {
        const result = await suggester.invoke(
          toLangChainMessages(messages, { cacheControl: false }),
          { signal },
        )
        const { questions } = SuggestedQuestionsSchema.parse(result.parsed)
        return { questions, usage: usageOf(result.raw) }
      } catch (error) {
        throw providerError(error, summaryModel, signal)
      }
    },
    async testConnection(signal) {
      try {
        await chat.invoke([new HumanMessage(TEST_PROMPT)], { signal })
      } catch (error) {
        throw providerError(error, model, signal)
      }
    },
  }
}
