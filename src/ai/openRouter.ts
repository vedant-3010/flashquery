import { z } from '@/lib/zod'
import { AppError } from '@/lib/errors'

// OpenRouter with the user's own account (F-AI-07, D119): connecting it (OAuth PKCE, so no key is
// copied by hand) and the models it can answer with. Every model listed here supports structured
// outputs on a zero-data-retention endpoint, since HushGlance demands both (OPENROUTER_PRIVACY).

export const OPENROUTER_ORIGIN = 'https://openrouter.ai'

/** Where the user approves HushGlance (the key is made for their account, with their limits). */
export function openRouterAuthUrl(callbackUrl: string, challenge: string): string {
  const url = new URL('/auth', OPENROUTER_ORIGIN)
  url.searchParams.set('callback_url', callbackUrl)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

const KeyResponseSchema = z.object({ key: z.string().min(8) })

/** Trades the code OpenRouter sent back (and our verifier) for the user's new API key. */
export async function exchangeOpenRouterCode(
  code: string,
  verifier: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(`${OPENROUTER_ORIGIN}/api/v1/auth/keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  })
  const parsed = KeyResponseSchema.safeParse(await response.json().catch(() => null))
  if (!response.ok || !parsed.success) {
    throw new AppError({
      code: 'openrouter_connect',
      message: 'OpenRouter didn’t confirm the connection. Try connecting again.',
      detail: `HTTP ${response.status}`,
    })
  }
  return parsed.data.key
}

export interface OpenRouterModel {
  id: string
  name: string
  /** USD per million tokens. */
  inputPerMTok: number
  outputPerMTok: number
}

const ModelListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      supported_parameters: z.array(z.string()).nullable().optional(),
      pricing: z.object({ prompt: z.coerce.number(), completion: z.coerce.number() }).partial(),
    }),
  ),
})

const ZdrListSchema = z.object({
  data: z.array(
    z.object({
      model_id: z.string(),
      supported_parameters: z.array(z.string()).nullable().optional(),
    }),
  ),
})

/** Models with structured outputs on a zero-retention endpoint, by slug (maker first). */
export function usableModels(models: unknown, zdr: unknown): OpenRouterModel[] {
  const list = ModelListSchema.safeParse(models)
  const endpoints = ZdrListSchema.safeParse(zdr)
  if (!list.success || !endpoints.success) return []
  const zeroRetention = new Set(
    endpoints.data.data
      .filter((endpoint) => endpoint.supported_parameters?.includes('structured_outputs'))
      .map((endpoint) => endpoint.model_id),
  )
  return list.data.data
    .filter(
      (model) =>
        zeroRetention.has(model.id) &&
        model.supported_parameters?.includes('structured_outputs') &&
        !model.id.endsWith(':free'),
    )
    .map((model) => ({
      id: model.id,
      name: model.name,
      inputPerMTok: (model.pricing.prompt ?? 0) * 1_000_000,
      outputPerMTok: (model.pricing.completion ?? 0) * 1_000_000,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** The models the user's own OpenRouter account can answer with (two public lists, no key). */
export async function listOpenRouterModels(
  fetcher: typeof fetch = fetch,
): Promise<OpenRouterModel[]> {
  const [models, zdr] = await Promise.all(
    ['/api/v1/models', '/api/v1/endpoints/zdr'].map(async (path) => {
      const response = await fetcher(`${OPENROUTER_ORIGIN}${path}`)
      if (!response.ok) throw new Error(`OpenRouter ${path}: ${response.status}`)
      return response.json() as Promise<unknown>
    }),
  )
  return usableModels(models, zdr)
}
