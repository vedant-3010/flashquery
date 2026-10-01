import { z } from 'zod'
import { PrivacyModeSchema } from '@/ai/schemas'

// The AI payload log behind "What the AI saw" (F-EXPL-04): every request exactly as sent, the
// parsed output, token usage and latency. API keys never appear (F-SEC-04): the provider sends them
// in headers, and redactSecrets() scrubs anything key-shaped from text that does get logged.

export const UsageSchema = z.object({
  /** All input tokens, cached ones included (LangChain's usage_metadata.input_tokens). */
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
})
export type Usage = z.infer<typeof UsageSchema>

export const LoggedMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
})

export const AiLogEntrySchema = z.object({
  id: z.string(),
  answerId: z.string(),
  purpose: z.enum(['plan', 'repair', 'summary', 'dashboard', 'test']),
  provider: z.string(),
  model: z.string(),
  mode: PrivacyModeSchema,
  /** Values from the data itself in this request (0 in strict mode). */
  dataValues: z.number(),
  messages: z.array(LoggedMessageSchema),
  output: z.unknown(),
  error: z.string().nullable(),
  usage: UsageSchema.nullable(),
  ms: z.number(),
  at: z.number(),
})
export type AiLogEntry = z.infer<typeof AiLogEntrySchema>

const KEY_PATTERNS = [/sk-ant-[A-Za-z0-9_-]{8,}/g, /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/g]

/** Replaces API keys (the given ones, and anything key-shaped) with [redacted]. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length >= 8) out = out.split(secret).join('[redacted]')
  }
  for (const pattern of KEY_PATTERNS) out = out.replace(pattern, '[redacted]')
  return out
}
