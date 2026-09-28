import type { ProviderId } from '@/ai/schemas'

// The only place model IDs live (CLAUDE.md). Prices are USD per million tokens, for the usage meter
// (F-AI-04). Sources: Anthropic model table (Claude API skill, 2026-06) and
// developers.openai.com/api/docs/pricing (checked 2026-09-28). Check provider docs before changing.

export interface ModelInfo {
  id: string
  provider: ProviderId
  label: string
  description: string
  inputPerMTok: number
  outputPerMTok: number
  /** Accepts output_config.effort (Anthropic) / reasoning effort (OpenAI). */
  supportsEffort: boolean
}

export const MODELS: ModelInfo[] = [
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5',
    description: 'Recommended: accurate SQL, quick answers.',
    inputPerMTok: 2,
    outputPerMTok: 10,
    supportsEffort: true,
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    label: 'Claude Opus 5',
    description: 'Most capable, for hard multi-table questions. Slower.',
    inputPerMTok: 5,
    outputPerMTok: 25,
    supportsEffort: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    label: 'Claude Haiku 4.5',
    description: 'Fastest and cheapest.',
    inputPerMTok: 1,
    outputPerMTok: 5,
    supportsEffort: false,
  },
  {
    id: 'gpt-6-sol',
    provider: 'openai',
    label: 'GPT-6 Sol',
    description: 'Balanced intelligence and cost.',
    inputPerMTok: 2,
    outputPerMTok: 10,
    supportsEffort: true,
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    label: 'GPT-6 Astra',
    description: 'Most capable OpenAI model. Slower and pricier.',
    inputPerMTok: 10,
    outputPerMTok: 50,
    supportsEffort: true,
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    label: 'GPT-6 Luna',
    description: 'Fastest and cheapest.',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    supportsEffort: true,
  },
]

export const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-6-sol',
}

/** For cheap, latency-sensitive calls (e.g. suggested questions, M7). */
export const FAST_MODEL: Record<ProviderId, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-6-luna',
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
}

export function modelsFor(provider: ProviderId): ModelInfo[] {
  return MODELS.filter((model) => model.provider === provider)
}

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((model) => model.id === id)
}
