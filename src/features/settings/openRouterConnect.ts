import { openRouterAuthUrl } from '@/ai/openRouter'
import { appUrl, paths } from '@/app/paths'
import { challengeFor, randomVerifier } from '@/lib/pkce'

// "Connect OpenRouter" (F-AI-07): OpenRouter's own sign-in makes a key for the user's account and
// sends them back with a code; the verifier waits in this tab's session storage meanwhile.

const VERIFIER = 'hushglance.openrouter.verifier'
const RETURN_TO = 'hushglance.openrouter.returnTo'

/** Leaves for OpenRouter's sign-in; ConnectOpenRouterPage finishes when it sends the user back. */
export async function connectOpenRouter(returnTo: string): Promise<void> {
  const verifier = randomVerifier()
  sessionStorage.setItem(VERIFIER, verifier)
  sessionStorage.setItem(RETURN_TO, returnTo)
  const callback = `${window.location.origin}${appUrl(paths.connectOpenRouter)}`
  window.location.assign(openRouterAuthUrl(callback, await challengeFor(verifier)))
}

/** The verifier and the path to go back to, once (they're removed as they're read). */
export function takeConnectState(): { verifier: string | null; returnTo: string } {
  const verifier = sessionStorage.getItem(VERIFIER)
  const returnTo = sessionStorage.getItem(RETURN_TO)
  sessionStorage.removeItem(VERIFIER)
  sessionStorage.removeItem(RETURN_TO)
  // Only a path in this app (no other site), like ?next= after signing in.
  const safe = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : paths.home
  return { verifier, returnTo: safe }
}
