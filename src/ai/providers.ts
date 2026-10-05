import type { Usage } from '@/ai/log'
import type { PromptMessage } from '@/ai/prompts/planSql'
import type { AnswerSummary, DashboardPlan, ProviderId, SqlPlan } from '@/ai/schemas'

// LLMProvider hides LangChain (PRD D6): the pipeline only sees planSql(). Real providers load on
// first use (dynamic import keeps LangChain out of the initial bundle, F-PERF-01).

export interface PlanRequest {
  question: string
  messages: PromptMessage[]
  /** Tables in scope (the fixture provider needs to know whether the demo table is loaded). */
  tables: string[]
  signal?: AbortSignal
}

export interface PlanResponse {
  plan: SqlPlan
  usage: Usage | null
}

export interface SummaryRequest {
  messages: PromptMessage[]
  signal?: AbortSignal
}

export interface SummaryResponse {
  summary: AnswerSummary
  usage: Usage | null
}

export interface SuggestResponse {
  questions: string[]
  usage: Usage | null
}

export interface DashboardRequest {
  messages: PromptMessage[]
  /** The table the dashboard is for (the fixture provider only knows the demo table). */
  table: string
  signal?: AbortSignal
}

export interface DashboardResponse {
  plan: DashboardPlan
  usage: Usage | null
}

export interface LLMProvider {
  id: ProviderId | 'fixture'
  model: string
  /** True when planSql sends `messages` to a remote API (and so should be logged). */
  remote: boolean
  planSql(request: PlanRequest): Promise<PlanResponse>
  /** The model that writes AI summaries (F-ASK-12): the provider's fast one. Null without summaries. */
  summaryModel: string | null
  summarize?(request: SummaryRequest): Promise<SummaryResponse>
  /** Questions worth asking about the data (F-PROF-04), with the summary model. */
  suggestQuestions?(request: SummaryRequest): Promise<SuggestResponse>
  /** A first dashboard for a table (F-DASH-09). */
  planDashboard(request: DashboardRequest): Promise<DashboardResponse>
  /** A tiny request that proves the key and model work ("Test connection"). */
  testConnection(signal?: AbortSignal): Promise<void>
}

export interface ProviderSettings {
  provider: ProviderId
  apiKey: string
  model: string
  /** Local OpenAI-compatible server (F-AI-06), already checked by localBaseUrl(). */
  baseUrl?: string
  /** For tests: stands in for the network. */
  fetch?: typeof fetch
}

export async function createProvider(settings: ProviderSettings): Promise<LLMProvider> {
  if (settings.provider === 'anthropic') {
    const { createAnthropicProvider } = await import('@/ai/providers/anthropic')
    return createAnthropicProvider(settings)
  }
  const { createOpenAIProvider } = await import('@/ai/providers/openai')
  return createOpenAIProvider(settings)
}
