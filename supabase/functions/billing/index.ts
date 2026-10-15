// Pro through Dodo Payments (F-PLAN-03, PRD D120): checkout, the customer portal and the webhook.
// The logic is in ../_shared/billing.ts (unit-tested in src/test/edge/); this file only wires it.
import { handleBilling } from '../_shared/billing.ts'
import { readBillingConfig } from '../_shared/config.ts'
import { errorResponse } from '../_shared/http.ts'
import { serviceKeyFrom, supabaseRest } from '../_shared/rest.ts'

const get = (name: string) => Deno.env.get(name)

Deno.serve(async (request) => {
  let config
  try {
    config = readBillingConfig(get)
  } catch {
    console.error('billing: not configured')
    return errorResponse(503, 'billing_unavailable', 'Billing isn’t set up here.')
  }
  const serviceKey = serviceKeyFrom(get)
  const url = get('SUPABASE_URL')
  if (!serviceKey || !url) return errorResponse(503, 'billing_unavailable', 'Not configured.')
  return handleBilling(request, {
    config,
    rest: supabaseRest({ url, serviceKey, fetch }),
    fetch,
    now: () => Date.now(),
    log: (line) => console.log(line),
  })
})
