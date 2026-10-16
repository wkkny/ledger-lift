// The whole thing for real: the built app starts Ollama itself, reads a ledger photo with the actual
// model, streams rows, and stops Ollama again on quit. Slow, so it only runs when given a photo:
//   LEDGER_TEST_IMAGE=photo.jpg LEDGER_TEST_ANSWERS=photo.csv pnpm test:e2e
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { launchApp } from './launch'

const image = process.env.LEDGER_TEST_IMAGE
const answers = process.env.LEDGER_TEST_ANSWERS

const ollamaUp = () => fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false)

function parseCsvRows(text: string): string[][] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(1)
    .map((line) => [...line.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)].map((m) => (m[1] ?? m[2]).replaceAll('""', '"')))
}

describe.skipIf(!image)('with the real model', () => {
  it('reads a photo, streams the rows, saves a CSV, and stops the Ollama it started', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ledger-real-'))
    const savePath = join(directory, 'saved.csv')
    const startedByApp = !(await ollamaUp())
    const app = await launchApp({})
    try {
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog
      }, savePath)
      const page = await app.firstWindow()
      await page.waitForFunction(() => document.querySelector('#main')?.getAttribute('data-setup-phase') === 'ready', undefined, { timeout: 60_000 })

      await page.locator('input[type=file]').setInputFiles(image!)
      const clicked = Date.now()
      await page.locator('.primary-button').click()
      await page.waitForFunction(
        () => document.querySelectorAll('tr.entry-row').length >= 1 && (document.querySelector('.primary-button') as HTMLButtonElement).disabled,
        undefined,
        { timeout: 120_000, polling: 100 }
      )
      const firstRowAt = (Date.now() - clicked) / 1000
      await page.waitForFunction(() => !(document.querySelector('.primary-button') as HTMLButtonElement).disabled, undefined, { timeout: 180_000, polling: 250 })
      const doneAt = (Date.now() - clicked) / 1000

      const shown = await page.locator('tr.entry-row').evaluateAll((trs) =>
        trs.map((tr) => [...tr.querySelectorAll('input:not([type=checkbox])')].map((input) => (input as HTMLInputElement).value))
      )
      console.log(`${shown.length} rows; first row at ${firstRowAt.toFixed(1)}s, done at ${doneAt.toFixed(1)}s`)
      expect(shown.length).toBeGreaterThan(0)
      expect(firstRowAt).toBeLessThan(doneAt - 1) // rows really arrived before the end

      if (answers) {
        const expected = parseCsvRows(readFileSync(answers, 'utf8'))
        const exact = expected.filter((row, index) => row.every((value, column) => shown[index]?.[column] === value)).length
        console.log(`${exact}/${expected.length} rows exactly right`)
        expect(shown.length).toBe(expected.length)
        expect(exact).toBeGreaterThanOrEqual(expected.length - 1)
      }

      for (const box of await page.locator('.review-checkbox').all()) await box.check()
      await page.getByRole('button', { name: /Download CSV/ }).click()
      await page.getByText(/^Saved to /).waitFor()
      expect(parseCsvRows(readFileSync(savePath, 'utf8'))).toEqual(shown)
    } finally {
      await app.close()
      rmSync(directory, { recursive: true, force: true })
    }
    if (startedByApp) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      expect(await ollamaUp(), 'the Ollama the app started should stop when the app quits').toBe(false)
    }
  })
})
