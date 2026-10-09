// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from '@/lib/zod'

// F-SHIP-01: the Vercel deployment serves the build as-is: wasm as application/wasm, hashed
// assets cached forever, framing denied (a meta CSP can't set frame-ancestors, PRD D66).

const VercelConfigSchema = z.object({
  outputDirectory: z.string(),
  buildCommand: z.string(),
  redirects: z.array(
    z.object({ source: z.string(), destination: z.string(), permanent: z.boolean() }),
  ),
  rewrites: z.array(z.object({ source: z.string(), destination: z.string() })),
  headers: z.array(
    z.object({
      source: z.string(),
      headers: z.array(z.object({ key: z.string(), value: z.string() })),
    }),
  ),
})

const config = VercelConfigSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8')),
)

function headerFor(path: string, key: string): string | undefined {
  let value: string | undefined
  for (const rule of config.headers) {
    const pattern = new RegExp(
      `^${rule.source.replace(/\./g, '\\.').replace(/\(\\\.\*\)/g, '(.*)')}$`,
    )
    if (!pattern.test(path)) continue
    value = rule.headers.find((header) => header.key === key)?.value ?? value
  }
  return value
}

describe('vercel.json', () => {
  it('builds with the same command as CI into dist', () => {
    expect(config).toMatchObject({ buildCommand: 'npm run build', outputDirectory: 'dist' })
  })

  it('serves wasm as application/wasm and caches hashed assets', () => {
    expect(headerFor('/assets/duckdb-eh-CfdE9-rk.wasm', 'Content-Type')).toBe('application/wasm')
    expect(headerFor('/assets/index-BzWdGiSB.js', 'Cache-Control')).toContain('immutable')
    expect(headerFor('/index.html', 'Cache-Control')).toBeUndefined()
  })

  it('denies framing and sniffing on every path', () => {
    expect(headerFor('/', 'Content-Security-Policy')).toBe("frame-ancestors 'none'")
    expect(headerFor('/index.html', 'X-Content-Type-Options')).toBe('nosniff')
  })

  it('sends /app to /app/, where the app lives (the landing page is at /, PRD D99)', () => {
    expect(config.redirects).toContainEqual({
      source: '/app',
      destination: '/app/',
      permanent: true,
    })
  })

  it('serves the app for every path under /app/, which routes it (F-HOME-01)', () => {
    expect(config.rewrites).toContainEqual({
      source: '/app/(.*)',
      destination: '/app/index.html',
    })
  })
})
