// Records public/og.png, the link preview for the landing page (PRD D99): the hero at 1200×630
// with the film on its finished frame (reduced motion). Run after `npm run build`:
//
//   node scripts/record-og.mjs

import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const OUT = fileURLToPath(new URL('../public/og.png', import.meta.url))
const PORT = 4177

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  await page.goto(`http://localhost:${PORT}/`)
  await page.getByRole('figure').getByText('APAC leads with').waitFor()
  await page.evaluate(() => document.fonts.ready)
  // Let the entrance fades finish (opacity still animates with reduced motion).
  await page.waitForTimeout(1800)
  await page.screenshot({ path: OUT })
  console.log(`Wrote ${OUT}`)
} finally {
  await browser.close()
  await server.close()
}
