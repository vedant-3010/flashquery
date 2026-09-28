/// <reference types="vitest/config" />
// askdata:vite-config
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/features',
      'echarts/renderers',
      'xlsx', // imported by the Excel worker
    ],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
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
