import { HumanMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { findModel } from '@/ai/models'
import type { LLMProvider, ProviderSettings } from '@/ai/providers'
import { TEST_PROMPT } from '@/ai/prompts/testConnection'
import { providerError, toLangChainMessages, usageOf } from '@/ai/providers/langchain'
import { SqlPlanSchema } from '@/ai/schemas'

// OpenAI through LangChain (PRD D6), called from the browser with the user's own key (BYOK, D3).
// Structured Outputs (strict JSON schema); OpenAI caches long prompt prefixes automatically.

export function createOpenAIProvider({ apiKey, model, fetch }: ProviderSettings): LLMProvider {
  const reasoning = findModel(model)?.supportsEffort
    ? { reasoning: { effort: 'medium' as const } }
    : {}
  const chat = new ChatOpenAI({
    apiKey,
    model,
    // LangChain retries (the SDK client it builds has retries off); its default of 6 is too many.
    maxRetries: 2,
    // Intentional: the user's own key, in their own browser (BYOK). See CLAUDE.md gotchas.
    configuration: { dangerouslyAllowBrowser: true, ...(fetch ? { fetch } : {}) },
    ...reasoning,
  })
  const planner = chat.withStructuredOutput(SqlPlanSchema, {
    name: 'sql_plan',
    method: 'jsonSchema',
    strict: true,
    includeRaw: true,
  })

  return {
    id: 'openai',
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
        throw providerError(error, model, signal)
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
