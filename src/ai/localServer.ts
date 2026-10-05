// Local OpenAI-compatible servers (F-AI-06): Ollama, LM Studio and the like, on this computer. The
// production CSP allows only http://localhost and http://127.0.0.1 besides the hosted APIs (PRD
// D85), so other hosts are refused here with an explanation instead of failing in the browser.

export const LOCAL_PRESETS = [
  { label: 'Ollama', url: 'http://localhost:11434/v1' },
  { label: 'LM Studio', url: 'http://localhost:1234/v1' },
] as const

export const DEFAULT_LOCAL_URL: string = LOCAL_PRESETS[0].url

/** Stands in for an API key: local servers usually need none, but the OpenAI client wants one. */
export const LOCAL_NO_KEY = 'local-server-no-key'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/** The URL without a trailing slash, or null when it isn't an http(s) URL on this computer. */
export function localBaseUrl(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!LOCAL_HOSTS.has(url.hostname) || url.username || url.password) return null
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}
