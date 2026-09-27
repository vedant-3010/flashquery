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
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm', 'pyodide'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  // NOTE: no COOP/COEP headers in v1 (see docs/PRD.md decision D5)
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
})
