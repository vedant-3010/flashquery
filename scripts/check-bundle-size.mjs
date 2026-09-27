// Fails when the initial JS exceeds the gzip budget (docs/PRD.md §5, F-PERF-02).
// "Initial JS" = every .js file referenced by dist/index.html: the entry module, its modulepreload
// chunks and theme-init.js. Lazy chunks, workers and wasm are excluded by construction.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET_BYTES = 350 * 1024
const dist = new URL('../dist/', import.meta.url)

let html
try {
  html = readFileSync(new URL('index.html', dist), 'utf8')
} catch {
  console.error('dist/index.html not found: run `npm run build` first.')
  process.exit(1)
}

const files = [...new Set([...html.matchAll(/\b(?:src|href)="\/?([^"]+\.js)"/g)].map((m) => m[1]))]
if (files.length === 0) {
  console.error('No JS references found in dist/index.html.')
  process.exit(1)
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
let total = 0
for (const file of files) {
  const gz = gzipSync(readFileSync(new URL(file, dist))).length
  total += gz
  console.log(`${kb(gz).padStart(10)}  ${file}`)
}

const verdict = total <= BUDGET_BYTES ? 'OK' : 'OVER BUDGET'
console.log(
  `${kb(total).padStart(10)}  total initial JS (gzip), budget ${kb(BUDGET_BYTES)}: ${verdict}`,
)
process.exit(total <= BUDGET_BYTES ? 0 : 1)
