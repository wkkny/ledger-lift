// Measures how well the real model reads your ledger pages. Put each photo in a folder next to the answer
// file with the same name (page1.jpg + page1.csv, header `date,item,quantity,amount`), then run:
//   LEDGER_SCORE_DIR=path/to/folder pnpm score
// Optional: LEDGER_SCORE_MODEL=<installed model name> to try a different model.
// It drives the built app, so it reads pages the way the app does, and writes score-report.json to the folder.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { combine, describe as describeScore, parseAnswerCsv, score, type ReadRow, type Score } from '../src/shared/scoring'
import { launchApp } from './launch'

const directory = process.env.LEDGER_SCORE_DIR
const model = process.env.LEDGER_SCORE_MODEL
const photos = directory
  ? readdirSync(directory).filter((name) => /\.(jpe?g|png|webp)$/i.test(name)).sort()
  : []

const results: { photo: string; seconds: number; score: Score | null; read: ReadRow[] }[] = []

describe.skipIf(!directory)('scoring against your answers', () => {
  let app: ElectronApplication
  let page: Page

  beforeAll(async () => {
    app = await launchApp({})
    page = await app.firstWindow()
    await page.waitForFunction(() => document.querySelector('#main')?.getAttribute('data-setup-phase') === 'ready', undefined, { timeout: 120_000 })
    if (model) {
      await page.locator('#model-trigger').click()
      await page.getByRole('option', { name: model, exact: true }).click()
      await page.locator('#model-trigger').click()
    }
  })

  afterAll(async () => {
    await app?.close()
    if (results.length === 0) return
    const scored = results.flatMap((each) => (each.score ? [each.score] : []))
    const total = scored.length > 0 ? combine(scored) : null
    console.log(`\n=== ${basename(directory!)}: ${scored.length} scored page(s) of ${results.length}${model ? `, model ${model}` : ''} ===`)
    if (total) console.log(describeScore(total))
    writeFileSync(join(directory!, 'score-report.json'), JSON.stringify({ model: model ?? 'default', pages: results, total }, null, 2))
    console.log(`Details: ${join(directory!, 'score-report.json')}`)
  })

  it('has photos to read', () => {
    expect(photos.length, `no .jpg/.png/.webp photos in ${directory}`).toBeGreaterThan(0)
  })

  for (const photo of photos) {
    it(`reads ${photo}`, async () => {
      const answerPath = join(directory!, basename(photo, extname(photo)) + '.csv')
      const answers = existsSync(answerPath) ? parseAnswerCsv(readFileSync(answerPath, 'utf8')) : null

      await page.locator('input[type=file]').setInputFiles(join(directory!, photo))
      const started = Date.now()
      await page.locator('.primary-button').click()
      await page.waitForFunction(() => document.querySelectorAll('tr.entry-row').length >= 1 || document.querySelector('.message'), undefined, { timeout: 180_000, polling: 250 })
      await page.waitForFunction(() => !(document.querySelector('.primary-button') as HTMLButtonElement).disabled, undefined, { timeout: 240_000, polling: 250 })
      const seconds = (Date.now() - started) / 1000

      const read: ReadRow[] = await page.locator('tr.entry-row').evaluateAll((trs) =>
        trs.map((tr) => {
          const cells = [...tr.querySelectorAll('input:not([type=checkbox])')] as HTMLInputElement[]
          const names = ['date', 'item', 'quantity', 'amount'] as const
          const row = Object.fromEntries(names.map((name, index) => [name, cells[index]?.value ?? ''])) as Record<(typeof names)[number], string>
          return { ...row, uncertain: names.filter((_, index) => cells[index]?.classList.contains('uncertain')) }
        })
      ) as ReadRow[]

      const result = answers ? score(answers, read) : null
      results.push({ photo, seconds, score: result, read })
      console.log(`\n${photo}: ${read.length} rows in ${seconds.toFixed(1)}s${answers ? '' : ' (no answer file, not scored)'}`)
      if (result) console.log(describeScore(result))

      const startOver = page.locator('.start-over')
      if (await startOver.count()) await startOver.click()
    })
  }
})

