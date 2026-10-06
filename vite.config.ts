/// <reference types="vitest/config" />
// flashQuery:vite-config
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Production Content-Security-Policy (F-SEC-06), as a meta tag in the built index.html (the dev
 * server needs inline scripts for HMR). It governs the page; our workers (DuckDB, Excel, Python) are
 * same-origin files with their own context. Every directive beyond 'self' is explained in
 * docs/PRD.md (D66).
 */
export const CONTENT_SECURITY_POLICY: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'worker-src': ["'self'", 'blob:'],
  'connect-src': [
    "'self'",
    'https://api.anthropic.com',
    'https://api.openai.com',
    'https://cdn.jsdelivr.net',
    'https://extensions.duckdb.org',
    // A local OpenAI-compatible server (Ollama, LM Studio), on this computer only (F-AI-06, D85).
    'http://localhost:*',
    'http://127.0.0.1:*',
  ],
  // CodeMirror and Radix's scroll lock inject <style> elements (D66).
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
}

function contentSecurityPolicy(): Plugin {
  const policy = Object.entries(CONTENT_SECURITY_POLICY)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
  return {
    name: 'flashQuery:csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  }
}

/** /app → /app/ on the dev and preview servers (Vercel does the same, see vercel.json). */
function appTrailingSlash(): Plugin {
  const redirect = (url: string | undefined) =>
    url === '/app' || url?.startsWith('/app?') || url?.startsWith('/app#')
  const middleware = (
    req: { url?: string },
    res: { statusCode: number; setHeader: (name: string, value: string) => void; end: () => void },
    next: () => void,
  ) => {
    if (!redirect(req.url)) return next()
    res.statusCode = 308
    res.setHeader('Location', `/app/${(req.url ?? '').slice(4)}`)
    res.end()
  }
  return {
    name: 'flashQuery:app-trailing-slash',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy(), appTrailingSlash()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Module workers (Comlink) with code-splitting inside workers
  worker: { format: 'es' },
  // Ship wasm + worker assets as-is; pre-bundling breaks their asset URLs
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm', 'pyodide'],
    // Pre-bundle deps that are only reached through lazy imports, so a cold dev server doesn't
    // discover them mid-session and reload the page (it broke e2e runs on a fresh server).
    include: [
      'apache-arrow',
      'comlink',
      '@tanstack/react-table',
      '@tanstack/react-virtual',
      '@uiw/react-codemirror',
      '@codemirror/lang-sql',
      'sql-formatter',
      '@langchain/anthropic',
      '@langchain/openai',
      '@langchain/core/messages',
      'react-grid-layout',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/features',
      'echarts/renderers',
      'xlsx', // imported by the Excel worker
    ],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // Two pages: the landing page at / and the app at /app/ (PRD D99).
    rolldownOptions: {
      input: {
        landing: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
  // NOTE: no COOP/COEP headers in v1 (see docs/PRD.md decision D5)
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    // Engine tests run real DuckDB (Node build) in parallel workers: slow machines need headroom.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
