import { expect, test, type Page } from '@playwright/test'

// M7 data import: paste cells (F-DATA-10), change a column's type (F-DATA-09) and re-import a CSV
// with options (F-DATA-08).

const dataset = (page: Page, label: string) => page.getByRole('region', { name: label })

const CELLS = 'city\tday\tsales\nPune\t03/01/2024\t1200\nGoa\t25/12/2024\tn/a\n'

test('pasted cells become a table; a column changes type with a preview', async ({ page }) => {
  await page.goto('/app/')
  await page.getByRole('button', { name: 'Paste data' }).click()
  const dialog = page.getByRole('dialog', { name: 'Paste data' })
  await dialog.getByRole('textbox', { name: /^Cells/ }).fill(CELLS)
  await expect(dialog.getByRole('status')).toContainText('2 rows × 3 columns')
  await dialog.getByRole('button', { name: 'Create table' }).click()
  const pasted = dataset(page, 'Pasted data')
  await expect(pasted).toContainText('pasted_data · 2 rows · 3 columns')
  await expect(pasted).toContainText('Pasted')

  // "sales" has a value that isn't a number: the preview says so before converting.
  await pasted.getByRole('button', { name: 'sales' }).click()
  await page.getByRole('button', { name: 'Change type…' }).click()
  const retype = page.getByRole('dialog', { name: 'Change the type of sales' })
  await retype.getByRole('combobox', { name: 'Convert to' }).click()
  await page.getByRole('option', { name: 'Whole number' }).click()
  await expect(retype.getByRole('status')).toContainText(
    "1 of 2 values can't be converted and will become empty (null), e.g. “n/a”.",
  )
  await retype.getByRole('button', { name: 'Convert column' }).click()
  await expect(retype).toBeHidden()
  await pasted.getByRole('button', { name: 'sales' }).click()
  await expect(page.getByRole('dialog')).toContainText('BIGINT')
  await page.keyboard.press('Escape')

  // Pasting cells outside a text field opens the dialog with them.
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, 'a\tb\n1\t2\n')
  await expect(
    page.getByRole('dialog', { name: 'Paste data' }).getByRole('textbox', { name: /^Cells/ }),
  ).toHaveValue('a\tb\n1\t2\n')
})

test('re-imports a CSV with a delimiter, header and skipped rows', async ({ page }) => {
  await page.goto('/app/')
  await page
    .getByTestId('file-input')
    .first()
    .setInputFiles({
      name: 'report.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Monthly report\nExported 2024-05-01\nname;amount\nA;1\nB;2\nC;3\n'),
    })
  const report = dataset(page, 'report.csv')
  await expect(report).toContainText('report · ')

  await report.getByRole('button', { name: 'Actions for report.csv' }).click()
  await page.getByRole('menuitem', { name: 'Import options…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import options for report.csv' })
  await dialog.getByRole('combobox', { name: 'Delimiter' }).click()
  await page.getByRole('option', { name: 'Semicolon' }).click()
  await dialog.getByRole('combobox', { name: 'Header' }).click()
  await page.getByRole('option', { name: 'First row is the header' }).click()
  await dialog.getByRole('spinbutton', { name: 'Skip rows at the top' }).fill('2')
  await dialog.getByRole('button', { name: 'Re-import' }).click()

  await expect(report).toContainText('report · 3 rows · 2 columns')
  await expect(report).toContainText('semicolon-separated · header row')
  await expect(report.getByRole('button', { name: 'amount' })).toBeVisible()
})
