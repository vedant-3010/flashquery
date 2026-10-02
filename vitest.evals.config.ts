import { defineConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// NL→SQL evals (F-QA-04): `npm run evals`, kept out of `npm test` because it needs an API key.
export default defineConfig({
  ...viteConfig,
  test: {
    environment: 'node',
    include: ['evals/**/*.eval.ts'],
    passWithNoTests: false,
    testTimeout: 60 * 60_000,
    hookTimeout: 120_000,
  },
})
