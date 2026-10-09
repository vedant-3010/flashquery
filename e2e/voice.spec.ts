import { expect, test, type Page } from '@playwright/test'
import { openProject } from './app.ts'

// J9 (F-ASK-17, D106): voice questions with on-device recognition only. A fake recognizer stands in
// for the browser's (the test Chromium has the API but no speech service) and records its setup.

interface SpeechSetup {
  lang: string
  processLocally: boolean
  started: number
}

async function fakeRecognizer(page: Page, words: string) {
  await page.addInitScript((spoken) => {
    const record = window as unknown as { __speech?: SpeechSetup }
    type Handler = ((event?: unknown) => void) | null
    class FakeRecognition {
      static async available() {
        return 'available'
      }
      static async install() {
        return true
      }
      lang = ''
      continuous = false
      interimResults = false
      onresult: Handler = null
      onerror: Handler = null
      onend: Handler = null
      onspeechstart: Handler = null
      onspeechend: Handler = null
      start() {
        record.__speech = {
          lang: this.lang,
          processLocally: (this as unknown as { processLocally: boolean }).processLocally,
          started: (record.__speech?.started ?? 0) + 1,
        }
        const result = (transcript: string, isFinal: boolean) => ({
          resultIndex: 0,
          results: [Object.assign([{ transcript }], { isFinal })],
        })
        setTimeout(() => this.onspeechstart?.(), 30)
        setTimeout(
          () => this.onresult?.(result(spoken.split(' ').slice(0, 2).join(' '), false)),
          120,
        )
        setTimeout(() => {
          this.onresult?.(result(spoken, true))
          this.onspeechend?.()
        }, 400)
      }
      stop() {
        setTimeout(() => this.onend?.(), 10)
      }
      abort() {
        this.onend?.()
      }
    }
    // On the prototype, like the browser's own (speech.ts checks for it there).
    Object.defineProperty(FakeRecognition.prototype, 'processLocally', {
      value: false,
      writable: true,
    })
    ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition
  }, words)
}

async function loadSales(page: Page) {
  await openProject(page)
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Global Sales · 10k rows' }).click()
  await expect(page.getByRole('region', { name: 'Global Sales · 10k rows' })).toBeVisible({
    timeout: 60_000,
  })
}

const box = (page: Page) => page.getByRole('textbox', { name: 'Ask a question' })

test('spoken words fill the box, recognized on the device; Enter asks (J9)', async ({ page }) => {
  await fakeRecognizer(page, 'Which region grew fastest?')
  await loadSales(page)
  await page.getByRole('button', { name: 'Ask by voice' }).click()
  await expect(page.getByText('Listening, on this device.')).toBeVisible()
  await expect(box(page)).toHaveValue('Which region grew fastest?')
  const setup = await page.evaluate(() => (window as unknown as { __speech: SpeechSetup }).__speech)
  expect(setup).toMatchObject({ processLocally: true, started: 1 })
  expect(setup.lang).toBe(await page.evaluate(() => navigator.language))

  await box(page).press('Enter')
  await expect(page.getByRole('article', { name: 'Which region grew fastest?' })).toBeVisible()
  await expect(box(page)).toHaveValue('')
  await expect(page.getByText('Listening, on this device.')).toBeHidden()
})

test('the shortcut starts listening and Esc stops it, keeping the words', async ({ page }) => {
  await fakeRecognizer(page, 'Total revenue by year')
  await loadSales(page)
  await box(page).fill('In 2025:')
  await page.keyboard.press('Control+Shift+Space')
  await expect(page.getByRole('button', { name: 'Stop voice input' })).toBeVisible()
  await expect(box(page)).toHaveValue('In 2025: Total revenue by year')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Ask by voice' })).toBeVisible()
  await expect(box(page)).toHaveValue('In 2025: Total revenue by year')
})

test('without on-device recognition the mic stays off and says why', async ({ page }) => {
  await page.addInitScript(() => {
    const scope = window as unknown as Record<string, unknown>
    scope.SpeechRecognition = undefined
    scope.webkitSpeechRecognition = undefined
  })
  await loadSales(page)
  await page.getByRole('button', { name: 'Voice input (unavailable)' }).click()
  await expect(page.getByText(/needs on-device speech recognition/)).toBeVisible()
  await expect(box(page)).toHaveValue('')
})
