import type { Effort, ProviderId, RequestEffort } from '@/ai/schemas'

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
  // OpenRouter slugs (maker/model), checked on openrouter.ai/api/v1/models (2026-10-11).
  openrouter: 'anthropic/claude-sonnet-5',
  // A suggestion for Ollama; local servers name their own models (F-AI-06).
  local: 'qwen2.5-coder:7b',
}

/** HushGlance AI's default (F-PLAN-01): an OpenRouter slug, listed in the ai_models table. */
export const HOSTED_DEFAULT_MODEL = 'anthropic/claude-sonnet-5'

/** For cheap, latency-sensitive calls (e.g. suggested questions, M7). */
export const FAST_MODEL: Record<ProviderId, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-6-luna',
  /** OpenRouter: the planner's maker's fast model (openRouterFastModel), else the planner. */
  openrouter: '',
  /** Empty: a local server uses its one model for everything. */
  local: '',
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  local: 'Local server (OpenAI-compatible)',
}

/** OpenRouter's fast model for a maker, for summaries and suggestions (its slugs, not ours). */
const OPENROUTER_FAST: Record<string, string> = {
  anthropic: 'anthropic/claude-haiku-4.5',
  openai: 'openai/gpt-6-luna',
}

/** The model that writes summaries for an OpenRouter planner: its maker's fast one, or itself. */
export function openRouterFastModel(model: string): string {
  return OPENROUTER_FAST[model.split('/')[0] ?? ''] ?? model
}

/**
 * The effort an OpenRouter request sends: only for models we know take it (by their own ID after
 * the maker), since OpenRouter routes only to endpoints that support every parameter we send.
 */
export function openRouterEffort(model: string, effort: Effort): RequestEffort | null {
  return requestEffort(model.split('/')[1] ?? '', effort)
}

/** "anthropic/claude-sonnet-5" → "claude-sonnet-5": a short label for an OpenRouter slug. */
export function openRouterShortLabel(model: string): string {
  const id = model.split('/')[1] ?? model
  return findModel(id) ? shortModelLabel(id) : id
}

export function modelsFor(provider: ProviderId): ModelInfo[] {
  return MODELS.filter((model) => model.provider === provider)
}

export function findModel(id: string): ModelInfo | undefined {
  return MODELS.find((model) => model.id === id)
}

/** A model's short name for tight spaces (the ask bar): "Sonnet 5", "GPT-6 Sol", or the raw ID. */
export function shortModelLabel(id: string): string {
  return findModel(id)?.label.replace(/^Claude /, '') ?? id
}

/** The efforts offered in the ask bar (F-ASK-16), with their trade-off. */
export const EFFORT_OPTIONS: { id: Effort; label: string; description: string }[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Picks low, medium or high per question; the progress line says which.',
  },
  {
    id: 'low',
    label: 'Low',
    description: 'Fastest and cheapest; fine for totals and simple lookups.',
  },
  { id: 'medium', label: 'Medium', description: 'Recommended: careful SQL at a normal pace.' },
  {
    id: 'high',
    label: 'High',
    description: 'Thinks longest; for multi-table or tricky questions.',
  },
]

/**
 * The effort a request to `model` sends: none for models that reject it (Haiku 4.5, unknown and
 * local models). 'auto' is resolved per question before asking (F-ASK-18); anything that still
 * gets it (dashboards, Python fixes) sends medium.
 */
export function requestEffort(model: string, effort: Effort): RequestEffort | null {
  if (!findModel(model)?.supportsEffort) return null
  return effort === 'auto' ? 'medium' : effort
}
