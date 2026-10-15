// The hosted AI proxy (F-PLAN-01, PRD D119): the logic is in ../_shared/aiProxy.ts (unit-tested in
// src/test/edge/); this file only wires it to the runtime and its secrets.
import { handleAi } from '../_shared/aiProxy.ts'
import { readAiConfig } from '../_shared/config.ts'
import { errorResponse } from '../_shared/http.ts'
import { serviceKeyFrom, supabaseRest } from '../_shared/rest.ts'

const get = (name: string) => Deno.env.get(name)

Deno.serve(async (request) => {
  let config
  try {
    config = readAiConfig(get)
  } catch {
    console.error('ai: not configured')
    return errorResponse(503, 'hosted_unavailable', 'HushGlance AI isn’t set up here.')
  }
  const serviceKey = serviceKeyFrom(get)
  const url = get('SUPABASE_URL')
  if (!serviceKey || !url) return errorResponse(503, 'hosted_unavailable', 'Not configured.')
  return handleAi(request, {
    config,
    rest: supabaseRest({ url, serviceKey, fetch }),
    fetch,
    log: (line) => console.log(line),
  })
})
