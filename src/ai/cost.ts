import type { Usage } from '@/ai/log'
import { findModel } from '@/ai/models'

// Usage meter (F-AI-04): an upper-bound cost estimate from the price table in models.ts. Cached
// input tokens are counted at the full input price (providers bill them for less), so the real
// cost is at most this. Null for models without a price (custom model IDs).

export function estimateCost(model: string, usage: Usage | null): number | null {
  const info = findModel(model)
  if (!info || !usage) return null
  return (
    (usage.inputTokens * info.inputPerMTok + usage.outputTokens * info.outputPerMTok) / 1_000_000
  )
}

export interface UsageTotal {
  inputTokens: number
  outputTokens: number
  /** Sum of the known costs; null when no request had a priced model. */
  cost: number | null
  /** Some requests used a model without a price, so `cost` leaves them out. */
  partial: boolean
}

export function totalUsage(entries: { model: string; usage: Usage | null }[]): UsageTotal {
  let cost: number | null = null
  let partial = false
  let inputTokens = 0
  let outputTokens = 0
  for (const entry of entries) {
    if (!entry.usage) continue
    inputTokens += entry.usage.inputTokens
    outputTokens += entry.usage.outputTokens
    const one = estimateCost(entry.model, entry.usage)
    if (one === null) partial = true
    else cost = (cost ?? 0) + one
  }
  return { inputTokens, outputTokens, cost, partial }
}
