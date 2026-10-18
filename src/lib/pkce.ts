// PKCE (RFC 7636) for signing in to another service without a secret in the browser: a random
// verifier stays here, only its SHA-256 challenge leaves first. Used by "Connect OpenRouter".

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** 43 URL-safe characters from 32 random bytes. */
export function randomVerifier(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** The S256 challenge for a verifier. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}
