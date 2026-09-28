import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage } from '@langchain/core/messages'
import { findModel } from '@/ai/models'
import type { LLMProvider, ProviderSettings } from '@/ai/providers'
import { TEST_PROMPT } from '@/ai/prompts/testConnection'
import { providerError, toLangChainMessages, usageOf } from '@/ai/providers/langchain'
import { SqlPlanSchema } from '@/ai/schemas'

// Claude through LangChain (PRD D6), called from the browser with the user's own key (BYOK, D3).
// Structured output uses native JSON outputs (output_config.format, `method: "jsonSchema"`): it
// works with adaptive thinking, which Sonnet 5 runs by default, unlike forced tool calls (D29).

const MAX_TOKENS = 16_000

export function createAnthropicProvider({ apiKey, model, fetch }: ProviderSettings): LLMProvider {
  const effort = findModel(model)?.supportsEffort
    ? { outputConfig: { effort: 'medium' as const } }
    : {}
  const chat = new ChatAnthropic({
    apiKey,
    model,
    maxTokens: MAX_TOKENS,
    // LangChain retries (the SDK client it builds has retries off); its default of 6 with backoff
    // would keep a rate-limited user waiting for minutes.
    maxRetries: 2,
    // Intentional: the user's own key, in their own browser (BYOK). See CLAUDE.md gotchas.
    clientOptions: { dangerouslyAllowBrowser: true, ...(fetch ? { fetch } : {}) },
    ...effort,
  })
  const planner = chat.withStructuredOutput(SqlPlanSchema, {
    name: 'sql_plan',
    method: 'jsonSchema',
    includeRaw: true,
  })

  return {
    id: 'anthropic',
    model,
    remote: true,
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
    async testConnection(signal) {
      try {
        await chat.invoke([new HumanMessage(TEST_PROMPT)], { signal })
      } catch (error) {
        throw providerError(error, model, signal)
      }
    },
  }
}
