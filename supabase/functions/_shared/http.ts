// HTTP helpers shared by the Edge Functions. Plain TypeScript with no Deno or npm imports, so the
// app's Vitest tests them too (src/test/edge/).

/** CORS headers for an allowed origin, or null: only the app's own origins may call us. */
export function corsHeaders(
  origin: string | null,
  allowed: readonly string[],
  allowHeaders: string,
): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': allowHeaders,
    'access-control-expose-headers': 'x-fq-remaining',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

/** A JSON error the app maps to an AppError: `{ error: { code, message, …extra } }`. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(status, { error: { code, message, ...extra } }, headers)
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  })
}

/** The bearer token of `Authorization: Bearer …`, or null. */
export function bearer(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  return match?.[1] ?? null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads a request body as text, refusing one larger than `limit` bytes. */
export async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > limit) return null
  const text = await request.text()
  return new TextEncoder().encode(text).length > limit ? null : text
}
