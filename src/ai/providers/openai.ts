import { HumanMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { FAST_MODEL, findModel } from '@/ai/models'
import type { LLMProvider, ProviderSettings } from '@/ai/providers'
import { TEST_PROMPT } from '@/ai/prompts/testConnection'
import { providerError, toLangChainMessages, usageOf } from '@/ai/providers/langchain'
import {
  AnswerSummarySchema,
  DashboardPlanSchema,
  SqlPlanSchema,
  SuggestedQuestionsSchema,
} from '@/ai/schemas'
import { AppError } from '@/lib/errors'

// OpenAI through LangChain (PRD D6), called from the browser with the user's own key (BYOK, D3).
// Structured Outputs (strict JSON schema); OpenAI caches long prompt prefixes automatically.
// The same client talks to local OpenAI-compatible servers (F-AI-06, `provider: 'local'`): their
// base URL, one model for everything, and JSON schema without OpenAI's `strict` flag.

/** Errors from a local server, in its terms (it's usually not running, or blocks this origin). */
function localError(error: AppError, baseUrl: string, model: string): AppError {
  const make = (message: string) =>
    new AppError({ code: error.code, message, detail: error.detail })
  switch (error.code) {
    case 'ai_network':
      return make(
        `Couldn't reach the local server at ${baseUrl}. Is it running, and does it accept requests from this page (CORS)?`,
      )
    case 'ai_model':
      return make(`The local server has no model "${model}". Download or load it there first.`)
    case 'ai_auth':
      return make('The local server rejected the API key.')
    default:
      return error
  }
}

export function createOpenAIProvider({
  provider,
  apiKey,
  model,
  baseUrl,
  fetch,
}: ProviderSettings): LLMProvider {
  const local = provider === 'local'
  const strict = local ? {} : { strict: true }
  const configuration = {
    dangerouslyAllowBrowser: true,
    ...(local && baseUrl ? { baseURL: baseUrl } : {}),
    ...(fetch ? { fetch } : {}),
  }
  const fail = (error: unknown, failedModel: string, signal?: AbortSignal) => {
    const appError = providerError(error, failedModel, signal)
    return local && baseUrl ? localError(appError, baseUrl, failedModel) : appError
  }
  const reasoning = findModel(model)?.supportsEffort
    ? { reasoning: { effort: 'medium' as const } }
    : {}
  const chat = new ChatOpenAI({
    apiKey,
    model,
    // LangChain retries (the SDK client it builds has retries off); its default of 6 is too many.
    maxRetries: 2,
    // Intentional: the user's own key, in their own browser (BYOK). See CLAUDE.md gotchas.
    configuration,
    ...reasoning,
  })
  const planner = chat.withStructuredOutput(SqlPlanSchema, {
    name: 'sql_plan',
    method: 'jsonSchema',
    ...strict,
    includeRaw: true,
  })
  const dashboardPlanner = chat.withStructuredOutput(DashboardPlanSchema, {
    name: 'dashboard_plan',
    method: 'jsonSchema',
    ...strict,
    includeRaw: true,
  })
  // Summaries use the fast model: a few sentences about ≤ 50 rows (F-ASK-12, PRD D41).
  const summaryModel = local ? model : FAST_MODEL.openai
  const fast = new ChatOpenAI({
    apiKey,
    model: summaryModel,
    maxRetries: 2,
    configuration,
    ...(findModel(summaryModel)?.supportsEffort ? { reasoning: { effort: 'low' as const } } : {}),
  })
  const summarizer = fast.withStructuredOutput(AnswerSummarySchema, {
    name: 'answer_summary',
    method: 'jsonSchema',
    ...strict,
    includeRaw: true,
  })
  const suggester = fast.withStructuredOutput(SuggestedQuestionsSchema, {
    name: 'suggested_questions',
    method: 'jsonSchema',
    ...strict,
    includeRaw: true,
  })

  return {
    id: local ? 'local' : 'openai',
    model,
    remote: true,
    async planSql({ messages, signal }) {
      try {
        const result = await planner.invoke(
          toLangChainMessages(messages, { cacheControl: false }),
          {
            signal,
          },
        )
        return { plan: SqlPlanSchema.parse(result.parsed), usage: usageOf(result.raw) }
      } catch (error) {
        throw fail(error, model, signal)
      }
    },
    async planDashboard({ messages, signal }) {
      try {
        const result = await dashboardPlanner.invoke(
          toLangChainMessages(messages, { cacheControl: false }),
          { signal },
        )
        return { plan: DashboardPlanSchema.parse(result.parsed), usage: usageOf(result.raw) }
      } catch (error) {
        throw fail(error, model, signal)
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
        throw fail(error, summaryModel, signal)
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
        throw fail(error, summaryModel, signal)
      }
    },
    async testConnection(signal) {
      try {
        await chat.invoke([new HumanMessage(TEST_PROMPT)], { signal })
      } catch (error) {
        throw fail(error, model, signal)
      }
    },
  }
}
