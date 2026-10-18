import { bearer, corsHeaders, errorResponse, isRecord, readBody } from './http.ts'
import type { Rest } from './rest.ts'

// The hosted AI proxy (F-PLAN-01, PRD D119). A signed-in user's chat-completions request goes to
// OpenRouter with HushGlance's key, after the quota check (ai_begin), with zero data retention
// forced whatever the client sent. Nothing a user sent or a model wrote is stored or logged: only
// token counts and cost (ai_finish), and status codes in the log.

export const MAX_BODY_BYTES = 256 * 1024
export const MAX_OUTPUT_TOKENS = 16_000
const MAX_MESSAGES = 64

/** Sent on every request: only zero-data-retention endpoints that support all our parameters. */
export const FORCED_PROVIDER = Object.freeze({
  zdr: true,
  data_collection: 'deny',
  require_parameters: true,
})

/** Only these reach us from the browser; hostedFetch (src/platform/hostedAi.ts) sends no others. */
export const AI_ALLOW_HEADERS = 'authorization, apikey, content-type, x-fq-question, x-fq-kind'

const QUESTION_ID = /^[A-Za-z0-9_-]{8,64}$/
const KINDS = new Set(['ask', 'dashboard', 'suggest'])

/** What a refusal from ai_begin means for the app (status, and a message a person can act on). */
const REFUSALS: Record<string, { status: number; message: string }> = {
  quota_reached: {
    status: 402,
    message: 'You’ve used your hosted questions. Upgrade to Pro, or use your own AI key.',
  },
  model_not_in_plan: {
    status: 403,
    message: 'That model is part of Pro. Pick another model, or upgrade.',
  },
  model_unknown: { status: 403, message: 'That model isn’t offered with HushGlance AI.' },
  email_unconfirmed: {
    status: 403,
    message: 'Confirm your email address to use HushGlance AI.',
  },
  rate_limited: { status: 429, message: 'Too many requests at once. Wait a moment, then retry.' },
  call_cap: {
    status: 429,
    message: 'This question has used all its AI calls. Ask it again as a new question.',
  },
  hosted_paused: {
    status: 503,
    message: 'HushGlance AI is paused for today. Use your own key, or try again tomorrow.',
  },
}

export interface AiConfig {
  openRouterKey: string
  /** https://openrouter.ai/api/v1/chat/completions (a local stub in development). */
  upstreamUrl: string
  appOrigins: string[]
  /** The spend breaker: hosted AI pauses once the last 24 hours cost this much. */
  dailyBudgetUsd: number | null
}

export interface AiDeps {
  config: AiConfig
  rest: Rest
  fetch: typeof globalThis.fetch
  /** Status lines only (never a body, a prompt or an upstream message). */
  log: (line: string) => void
}

export type Checked =
  | { ok: true; model: string; body: Record<string, unknown> }
  | { ok: false; code: string; message: string }

const refuse = (message: string, code = 'bad_request'): Checked => ({ ok: false, code, message })

/**
 * Checks a chat-completions body and returns the one we send: our caps and privacy settings, with
 * anything that could reach other models, other tools or other data policies removed.
 */
export function checkChatRequest(raw: unknown): Checked {
  if (!isRecord(raw)) return refuse('Expected a JSON object.')
  const { model, messages, tools } = raw
  if (typeof model !== 'string' || !/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(model)) {
    return refuse('Unknown model.')
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return refuse('Expected 1 to 64 messages.')
  }
  if (raw.stream === true) {
    return refuse('Streaming isn’t supported here.', 'streaming_unsupported')
  }
  if (
    tools !== undefined &&
    (!Array.isArray(tools) || tools.some((tool) => !isRecord(tool) || tool.type !== 'function'))
  ) {
    return refuse('Only function tools are allowed.')
  }
  if (raw.n !== undefined && raw.n !== 1) return refuse('Only one answer per request.')

  const body: Record<string, unknown> = { ...raw }
  // OpenRouter extras that would pick other models, add tools (web search, which falls outside
  // zero data retention) or change routing: never from a client.
  for (const key of [
    'models',
    'route',
    'plugins',
    'web_search_options',
    'transforms',
    'provider',
    'user',
    'usage',
    'stream_options',
    'metadata',
  ]) {
    delete body[key]
  }
  const limits = ['max_tokens', 'max_completion_tokens'].filter((key) => key in body)
  if (limits.length === 0) body.max_tokens = MAX_OUTPUT_TOKENS
  for (const key of limits) {
    const value = body[key]
    body[key] =
      typeof value === 'number' && value > 0
        ? Math.min(Math.floor(value), MAX_OUTPUT_TOKENS)
        : MAX_OUTPUT_TOKENS
  }
  if ('reasoning' in body) {
    const effort = isRecord(body.reasoning) ? body.reasoning.effort : undefined
    if (typeof effort === 'string') body.reasoning = { effort }
    else delete body.reasoning
  }
  body.provider = { ...FORCED_PROVIDER }
  body.usage = { include: true }
  return { ok: true, model, body }
}

export interface CallUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  costUsd: number
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0

/** Token counts and cost from an OpenRouter response; the price table when it reports no cost. */
export function parseUsage(
  text: string,
  prices: { inputPerMTok: number; outputPerMTok: number },
): CallUsage {
  let usage: Record<string, unknown> = {}
  try {
    const body: unknown = JSON.parse(text)
    if (isRecord(body) && isRecord(body.usage)) usage = body.usage
  } catch {
    // Not JSON (an upstream error page): no usage.
  }
  const inputTokens = count(usage.prompt_tokens)
  const outputTokens = count(usage.completion_tokens)
  const details = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {}
  const reported = typeof usage.cost === 'number' && usage.cost >= 0 ? usage.cost : null
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: count(details.cached_tokens),
    costUsd:
      reported ??
      (inputTokens * prices.inputPerMTok + outputTokens * prices.outputPerMTok) / 1_000_000,
  }
}

/** A stable pseudonym for OpenRouter's abuse checks: neither the email nor the id itself. */
export async function pseudonym(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`hushglance:${userId}`),
  )
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

interface Begin {
  allowed: boolean
  reason: string
  remaining: number
  usage_id?: number
  input_per_mtok?: number
  output_per_mtok?: number
}

function asBegin(value: unknown): Begin {
  if (!isRecord(value) || typeof value.allowed !== 'boolean' || typeof value.reason !== 'string') {
    throw new Error('ai_begin returned an unexpected shape')
  }
  return {
    allowed: value.allowed,
    reason: value.reason,
    remaining: typeof value.remaining === 'number' ? value.remaining : 0,
    usage_id: typeof value.usage_id === 'number' ? value.usage_id : undefined,
    input_per_mtok: Number(value.input_per_mtok ?? 0),
    output_per_mtok: Number(value.output_per_mtok ?? 0),
  }
}

export async function handleAi(request: Request, deps: AiDeps): Promise<Response> {
  const { config, rest, log } = deps
  const cors = corsHeaders(request.headers.get('origin'), config.appOrigins, AI_ALLOW_HEADERS)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} })
  }
  if (!cors) return errorResponse(403, 'origin_not_allowed', 'Not allowed from this origin.')
  if (
    request.method !== 'POST' ||
    !new URL(request.url).pathname.endsWith('/v1/chat/completions')
  ) {
    return errorResponse(404, 'not_found', 'Not found.', cors)
  }

  const token = bearer(request)
  const user = token ? await rest.user(token) : null
  if (!user) return errorResponse(401, 'not_signed_in', 'Sign in to use HushGlance AI.', cors)

  const question = request.headers.get('x-fq-question') ?? ''
  if (!QUESTION_ID.test(question)) {
    return errorResponse(400, 'bad_request', 'Missing the question id.', cors)
  }
  const kindHeader = request.headers.get('x-fq-kind') ?? 'ask'
  const kind = KINDS.has(kindHeader) ? kindHeader : 'ask'

  const text = await readBody(request, MAX_BODY_BYTES)
  if (text === null) return errorResponse(413, 'too_large', 'The request is too large.', cors)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return errorResponse(400, 'bad_request', 'Expected JSON.', cors)
  }
  const checked = checkChatRequest(parsed)
  if (!checked.ok) return errorResponse(400, checked.code, checked.message, cors)

  const begin = asBegin(
    await rest.rpc('ai_begin', {
      person: user.id,
      question,
      kind,
      model: checked.model,
      daily_budget: config.dailyBudgetUsd,
    }),
  )
  const remaining = { 'x-fq-remaining': String(begin.remaining) }
  if (!begin.allowed || begin.usage_id === undefined) {
    const refusal = REFUSALS[begin.reason] ?? { status: 403, message: 'Not allowed.' }
    log(`ai refused ${begin.reason}`)
    return errorResponse(
      refusal.status,
      begin.reason,
      refusal.message,
      { ...cors, ...remaining },
      { remaining: begin.remaining },
    )
  }

  const started = Date.now()
  let status = 502
  let body = ''
  let contentType = 'application/json'
  try {
    const upstream = await deps.fetch(config.upstreamUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.openRouterKey}`,
        'content-type': 'application/json',
        'x-title': 'HushGlance',
      },
      body: JSON.stringify({ ...checked.body, user: await pseudonym(user.id) }),
      signal: request.signal,
    })
    status = upstream.status
    contentType = upstream.headers.get('content-type') ?? contentType
    body = await upstream.text()
  } catch {
    body = JSON.stringify({
      error: { code: 'upstream_unreachable', message: 'Couldn’t reach the AI. Try again.' },
    })
  }

  const usage = parseUsage(body, {
    inputPerMTok: begin.input_per_mtok ?? 0,
    outputPerMTok: begin.output_per_mtok ?? 0,
  })
  try {
    await rest.rpc('ai_finish', {
      usage: begin.usage_id,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens,
      cost: usage.costUsd,
      upstream_status: status,
    })
  } catch {
    log('ai_finish failed')
  }
  log(`ai ${status} ${checked.model} ${Date.now() - started}ms`)
  // Our key, credits or OpenRouter itself failing isn't the user's doing: say so plainly (a 401 or
  // 402 passed through would read as the user's key, or as their quota). A failed first call gives
  // the question back (ai_finish).
  if (status !== 200 && status !== 400 && status !== 429) {
    return errorResponse(
      503,
      'hosted_unavailable',
      status === 404
        ? 'That model has no zero-retention provider available right now. Pick another model.'
        : 'HushGlance AI is having trouble. Try again shortly, or use your own key.',
      { ...cors, ...remaining },
    )
  }
  return new Response(body, {
    status,
    headers: { ...cors, ...remaining, 'content-type': contentType },
  })
}
