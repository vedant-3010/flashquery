// Fails when a page's initial JS exceeds its gzip budget (docs/PRD.md §5, F-PERF-02; D99).
// "Initial JS" = every .js file referenced by the page's HTML: the entry module, its modulepreload
// chunks and theme-init.js. Lazy chunks, workers and wasm are excluded by construction.
// Two pages: the landing page (dist/index.html) and the app (dist/app/index.html).
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const PAGES = [
  { name: 'app', html: 'app/index.html', budget: 350 * 1024 },
  { name: 'landing', html: 'index.html', budget: 150 * 1024 },
]
const dist = new URL('../dist/', import.meta.url)
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

let failed = false
for (const page of PAGES) {
  let html
  try {
    html = readFileSync(new URL(page.html, dist), 'utf8')
  } catch {
    console.error(`dist/${page.html} not found: run \`npm run build\` first.`)
    process.exit(1)
  }
  const files = [...new Set([...html.matchAll(/\b(?:src|href)="\/?([^"]+\.js)"/g)].map((m) => m[1]))]
  if (files.length === 0) {
    console.error(`No JS references found in dist/${page.html}.`)
    process.exit(1)
  }
  console.log(`${page.name} (dist/${page.html})`)
  let total = 0
  for (const file of files) {
    const gz = gzipSync(readFileSync(new URL(file, dist))).length
    total += gz
    console.log(`${kb(gz).padStart(10)}  ${file}`)
  }
  const ok = total <= page.budget
  failed ||= !ok
  console.log(
    `${kb(total).padStart(10)}  total initial JS (gzip) for the ${page.name}, budget ${kb(page.budget)}: ${ok ? 'OK' : 'OVER BUDGET'}\n`,
  )
}
process.exit(failed ? 1 : 0)
