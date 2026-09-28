import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { Usage } from '@/ai/log'
import type { PromptMessage } from '@/ai/prompts/planSql'
import { AppError } from '@/lib/errors'

// Shared by the LangChain-backed providers: message conversion, token usage and error mapping.

/**
 * PromptMessage[] → LangChain messages. With `cacheControl`, messages marked `cache` end in an
 * Anthropic cache breakpoint (the static instructions and the schema context).
 */
export function toLangChainMessages(
  messages: PromptMessage[],
  { cacheControl }: { cacheControl: boolean },
): BaseMessage[] {
  return messages.map((message) => {
    if (message.role === 'system') {
      if (cacheControl && message.cache) {
        return new SystemMessage({
          content: [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' } }],
        })
      }
      return new SystemMessage(message.content)
    }
    if (message.role === 'assistant') return new AIMessage(message.content)
    return new HumanMessage(message.content)
  })
}

const UsageMetadataSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  input_token_details: z
    .object({ cache_read: z.number().optional(), cache_creation: z.number().optional() })
    .optional(),
})

/** Token usage from the raw AIMessage (includeRaw: true), or null when the provider omits it. */
export function usageOf(raw: unknown): Usage | null {
  const metadata =
    typeof raw === 'object' && raw !== null && 'usage_metadata' in raw
      ? UsageMetadataSchema.safeParse(raw.usage_metadata)
      : null
  if (!metadata?.success) return null
  const { input_tokens, output_tokens, input_token_details } = metadata.data
  return {
    inputTokens: input_tokens,
    outputTokens: output_tokens,
    cacheReadTokens: input_token_details?.cache_read ?? 0,
    cacheWriteTokens: input_token_details?.cache_creation ?? 0,
  }
}

const statusOf = (error: unknown): number | null =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  typeof error.status === 'number'
    ? error.status
    : null

/** Provider errors → AppError with a message a user can act on. */
export function providerError(error: unknown, model: string, signal?: AbortSignal): AppError {
  if (error instanceof AppError) return error
  const detail = error instanceof Error ? error.message : String(error)
  if (signal?.aborted)
    return new AppError({ code: 'cancelled', message: 'Cancelled.', detail: null })
  const make = (code: string, message: string) => new AppError({ code, message, detail })
  switch (statusOf(error)) {
    case 401:
      return make('ai_auth', 'The API key was rejected. Check it in Settings.')
    case 403:
      return make('ai_forbidden', `This API key isn't allowed to use ${model}.`)
    case 404:
      return make('ai_model', `The model "${model}" wasn't found for this API key.`)
    case 429:
      return make(
        'ai_rate_limit',
        'The AI provider is rate-limiting requests. Wait a moment, then retry.',
      )
    case 400:
      return make('ai_request', 'The AI provider rejected the request.')
    case null:
      break
    default:
      return make('ai_unavailable', 'The AI provider is having trouble. Try again shortly.')
  }
  if (/fetch|network|connection/i.test(detail)) {
    return make('ai_network', "Couldn't reach the AI provider. Check your connection.")
  }
  return make('ai_bad_output', 'The AI replied in an unexpected format.')
}
