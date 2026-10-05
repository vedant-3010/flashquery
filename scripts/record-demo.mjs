// Records docs/demo.png, the README's animated demo (F-SHIP-02): an APNG (animated PNG) of the app in
// demo mode, assembled from Playwright screenshots. APNG instead of GIF: full colour, crisp text, no
// ffmpeg or new dependency (PRD D82). Run after `npm run build`:
//
//   node scripts/record-demo.mjs
//
// It serves dist/ with `vite preview`, drives the app with Playwright (Chromium) and writes the file.
// DEMO_FRAMES_DIR=<dir> also writes each frame as its own PNG, for review.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const OUT = fileURLToPath(new URL('../docs/demo.png', import.meta.url))
const PORT = 4176
const VIEWPORT = { width: 1280, height: 800 }

// ---- APNG assembly -------------------------------------------------------------------------------

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunks(png) {
  const list = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    list.push({ type, data: png.subarray(offset + 8, offset + 8 + length) })
    offset += 12 + length
  }
  return list
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, crc])
}

/** Frames must share size and colour type (same viewport); each keeps its own delay. */
function assembleApng(frames) {
  const first = chunks(frames[0].png)
  const ihdr = first.find((c) => c.type === 'IHDR').data
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const actl = Buffer.alloc(8)
  actl.writeUInt32BE(frames.length, 0)
  actl.writeUInt32BE(0, 4) // loop forever
  const out = [SIGNATURE, chunk('IHDR', ihdr), chunk('acTL', actl)]
  let sequence = 0
  frames.forEach((frame, index) => {
    const fctl = Buffer.alloc(26)
    fctl.writeUInt32BE(sequence++, 0)
    fctl.writeUInt32BE(width, 4)
    fctl.writeUInt32BE(height, 8)
    fctl.writeUInt32BE(0, 12) // x offset
    fctl.writeUInt32BE(0, 16) // y offset
    fctl.writeUInt16BE(frame.delayMs, 20)
    fctl.writeUInt16BE(1000, 22)
    fctl.writeUInt8(0, 24) // dispose: none
    fctl.writeUInt8(0, 25) // blend: source
    out.push(chunk('fcTL', fctl))
    const own = chunks(frame.png)
    const own_ihdr = own.find((c) => c.type === 'IHDR').data
    if (!own_ihdr.equals(ihdr)) throw new Error(`Frame ${index} has a different size or format`)
    for (const { type, data } of own) {
      if (type !== 'IDAT') continue
      if (index === 0) {
        out.push(chunk('IDAT', data))
      } else {
        const seq = Buffer.alloc(4)
        seq.writeUInt32BE(sequence++, 0)
        out.push(chunk('fdAT', Buffer.concat([seq, data])))
      }
    }
  })
  out.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(out)
}

// ---- The tour ------------------------------------------------------------------------------------

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' })
const browser = await chromium.launch()
const frames = []

try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  const shot = async (delayMs, settleMs = 400) => {
    await page.waitForTimeout(settleMs)
    frames.push({ png: await page.screenshot(), delayMs })
    process.stdout.write('.')
  }
  const ask = async (question) => {
    const box = page.getByRole('textbox', { name: 'Ask a question' })
    await box.fill(question)
    await shot(1200, 100)
    await box.press('Enter')
    const answer = page.getByRole('article', { name: question })
    await answer.getByRole('tab', { name: 'Chart' }).waitFor({ timeout: 60_000 })
    await answer.getByRole('img').first().waitFor({ timeout: 30_000 })
    return answer
  }

  await page.goto(`http://localhost:${PORT}/`)
  await page.getByRole('heading', { name: 'Ask your data anything' }).waitFor()
  await shot(2000)

  await page.getByRole('button', { name: 'Try sample data (1M rows)' }).click()
  await page.getByRole('region', { name: 'Global Sales · 1M rows' }).waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Skip the tour' }).click()
  await shot(1600)

  const growth = await ask('Which region grew fastest?')
  await shot(2800, 800)
  await growth.getByRole('tab', { name: 'SQL' }).click()
  await shot(2400)
  await growth.getByRole('tab', { name: 'Explanation' }).click()
  await shot(2400)

  const trend = await ask('Show the monthly revenue trend by channel')
  await trend.scrollIntoViewIfNeeded()
  await shot(2800, 800)

  await page.getByRole('tab', { name: 'Dashboard' }).click()
  await page.getByRole('button', { name: 'Generate dashboard' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Generate a dashboard' })
  await dialog.getByRole('button', { name: 'Generate' }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 })
  await shot(3200, 1500)

  await page.getByRole('button', { name: 'How AskData works' }).click()
  await page.getByRole('dialog', { name: 'How AskData works' }).waitFor()
  await shot(3200)
  await page.keyboard.press('Escape')

  await page.emulateMedia({ colorScheme: 'dark' })
  await shot(2800, 1200)
} finally {
  await browser.close()
  await server.close()
}

const framesDir = process.env.DEMO_FRAMES_DIR
if (framesDir) {
  mkdirSync(framesDir, { recursive: true })
  frames.forEach((frame, i) => writeFileSync(join(framesDir, `frame-${i + 1}.png`), frame.png))
}
const apng = assembleApng(frames)
writeFileSync(OUT, apng)
console.log(`\nWrote ${OUT}: ${frames.length} frames, ${(apng.length / 1e6).toFixed(1)} MB`)
