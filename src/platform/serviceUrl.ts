// The account service's URL (D102, D104): https, a host and nothing else, so the CSP can name exactly
// that host. Plain http only for this computer (`supabase start` serves http://127.0.0.1:54321).
// Shared by the app and the build (vite.config.ts). Pure; no Supabase code.

const LOOPBACK = new Set(['localhost', '127.0.0.1'])

/** The service URL, or null when it's missing or not a bare https (or local http) origin. */
export function parseServiceUrl(value: string | undefined): URL | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
  // URL() lets "*" through in host names: only letters, digits, dots and hyphens make a host.
  const host = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(
    url.hostname,
  )
  const secure =
    url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))
  return secure && bare && (host || LOOPBACK.has(url.hostname)) ? url : null
}

/** What the CSP's connect-src adds for the service: its exact https and wss host (F-SEC-08). */
export function serviceConnectSources(value: string | undefined): string[] {
  if (!value) return []
  const url = parseServiceUrl(value)
  if (!url) {
    throw new Error(
      `VITE_SUPABASE_URL must be an https origin like https://<project>.supabase.co (or a local http://127.0.0.1:<port>)`,
    )
  }
  const local = url.protocol === 'http:'
  return local
    ? [`http://${url.host}`, `ws://${url.host}`]
    : [`https://${url.host}`, `wss://${url.host}`]
}
