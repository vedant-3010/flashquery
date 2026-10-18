import { HumanMessage } from '@langchain/core/messages'
import { ChatOpenAI, ChatOpenAICompletions } from '@langchain/openai'
import { FAST_MODEL, openRouterEffort, openRouterFastModel, requestEffort } from '@/ai/models'
import type { LLMProvider, ProviderSettings } from '@/ai/providers'
import { TEST_PROMPT } from '@/ai/prompts/testConnection'
import { hostedError, providerError, toLangChainMessages, usageOf } from '@/ai/providers/langchain'
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
// base URL, one model for everything, and JSON schema without OpenAI's `strict` flag. And to
// OpenRouter (`provider: 'openrouter'`, D119): any maker's model by slug, chat completions only,
// every request demanding zero data retention; with the user's key, or hosted through HushGlance's
// proxy (src/platform/hostedAi.ts passes its base URL and fetch).

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** OpenRouter's output caps, as for Claude direct (the hosted proxy caps at the same 16k). */
const MAX_TOKENS = 16_000
const SUMMARY_MAX_TOKENS = 2_000

/**
 * Sent with every OpenRouter request: only endpoints that keep nothing (zero data retention), never
 * one that may train on it, and only ones that support everything we send (structured outputs). The
 * hosted proxy forces the same, whatever the client sends.
 */
export const OPENROUTER_PRIVACY = { zdr: true, data_collection: 'deny', require_parameters: true }

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
  effort: chosen = 'medium',
  baseUrl,
  fetch,
  summaryModel: chosenSummary,
  hosted = false,
}: ProviderSettings): LLMProvider {
  const local = provider === 'local'
  const openRouter = provider === 'openrouter'
  const strict = local ? {} : { strict: true }
  const configuration = {
    dangerouslyAllowBrowser: true,
    ...(local && baseUrl ? { baseURL: baseUrl } : {}),
    ...(openRouter ? { baseURL: baseUrl ?? OPENROUTER_BASE_URL } : {}),
    ...(fetch ? { fetch } : {}),
  }
  const fail = (error: unknown, failedModel: string, signal?: AbortSignal) => {
    if (hosted) return hostedError(error, failedModel, signal)
    const appError = providerError(error, failedModel, signal)
    return local && baseUrl ? localError(appError, baseUrl, failedModel) : appError
  }
  const effortFor = openRouter ? openRouterEffort : requestEffort
  const effort = effortFor(model, chosen)
  // OpenRouter speaks chat completions; ChatOpenAI would switch some model names to the Responses
  // API. OpenAI itself: `zdrEnabled` keeps any Responses API call from storing the response.
  const build = (fields: ConstructorParameters<typeof ChatOpenAI>[0] & object) =>
    openRouter ? new ChatOpenAICompletions(fields) : new ChatOpenAI(fields)
  // LangChain sends reasoning effort only to model names it knows (gpt-6-…, not openai/gpt-6-…):
  // OpenRouter gets its own `reasoning` field, and an output cap like Claude direct.
  const options = (sent: typeof effort, maxTokens: number) =>
    openRouter
      ? {
          maxTokens,
          modelKwargs: {
            provider: OPENROUTER_PRIVACY,
            ...(sent ? { reasoning: { effort: sent } } : {}),
          },
        }
      : {
          ...(provider === 'openai' ? { zdrEnabled: true } : {}),
          ...(sent ? { reasoning: { effort: sent } } : {}),
        }
  const chat = build({
    apiKey,
    model,
    // LangChain retries (the SDK client it builds has retries off); its default of 6 is too many.
    maxRetries: 2,
    // Intentional: the user's own key, in their own browser (BYOK). See CLAUDE.md gotchas.
    configuration,
    ...options(effort, MAX_TOKENS),
  })
  // Claude through OpenRouter takes the same cache breakpoints as Claude direct.
  const cacheControl = openRouter && model.startsWith('anthropic/')
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
  const summaryModel = local
    ? model
    : openRouter
      ? (chosenSummary ?? openRouterFastModel(model))
      : FAST_MODEL.openai
  const summaryEffort = effortFor(summaryModel, 'low')
  const fast = build({
    apiKey,
    model: summaryModel,
    maxRetries: 2,
    configuration,
    ...options(summaryEffort, SUMMARY_MAX_TOKENS),
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
    id: hosted ? 'hushglance' : provider,
    model,
    remote: true,
    effort,
    summaryEffort,
    async planSql({ messages, signal }) {
      try {
        const result = await planner.invoke(toLangChainMessages(messages, { cacheControl }), {
          signal,
        })
        return { plan: SqlPlanSchema.parse(result.parsed), usage: usageOf(result.raw) }
      } catch (error) {
        throw fail(error, model, signal)
      }
    },
    async planDashboard({ messages, signal }) {
      try {
        const result = await dashboardPlanner.invoke(
          toLangChainMessages(messages, { cacheControl }),
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
