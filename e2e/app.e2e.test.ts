// Drives the real, built app (main process, preload bridge, and interface) against a fake Ollama.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { startFakeOllama, type FakeOllama, type FakeOptions } from './fake-ollama'
import { launchApp } from './launch'
import { findBinary } from '../src/main/ollama'
import { makePng } from './png'

let directory: string
let photo: string
let fake: FakeOllama
let app: ElectronApplication | undefined

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'ledger-e2e-'))
  photo = join(directory, 'page.png')
  writeFileSync(photo, makePng(64, 48)) // the interface shrinks and re-encodes whatever photo it is given
  return () => rmSync(directory, { recursive: true, force: true })
})

afterEach(async () => {
  await app?.close().catch(() => {})
  app = undefined
  await fake?.close()
})

async function launch(options: FakeOptions): Promise<{ page: Page; savePath: string }> {
  fake = await startFakeOllama(options)
  const savePath = join(directory, `saved-${Date.now()}.csv`)
  app = await launchApp({ OLLAMA_HOST: fake.host })
  // The native save dialog can't be driven; answer it with a file in the temp directory.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog
  }, savePath)
  const page = await app.firstWindow()
  return { page, savePath }
}

/** The width and height of a base64 JPEG, read from its start-of-frame marker. */
function jpegSize(base64: string): { width: number; height: number } {
  const bytes = Buffer.from(base64, 'base64')
  for (let i = 2; i + 9 < bytes.length; ) {
    if (bytes[i] !== 0xff) throw new Error('Not a JPEG.')
    const marker = bytes[i + 1]
    if (marker >= 0xc0 && marker <= 0xc2) return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) }
    i += 2 + bytes.readUInt16BE(i + 2)
  }
  throw new Error('No size found in the JPEG.')
}

const readButton = (page: Page) => page.locator('.primary-button')
const rows = (page: Page) => page.locator('tr.entry-row')
const waitUntilReady = (page: Page, timeout = 15_000) =>
  page.waitForFunction(() => document.querySelector('#main')?.getAttribute('data-setup-phase') === 'ready', undefined, { timeout })

describe('reading more than one page', () => {
  it('adds a second page to the rows already read, and one download holds both', async () => {
    const { page, savePath } = await launch({
      rows: [
        { item: 'Rice 5kg', quantity: '1', amount: '1450' },
        { item: 'Salt', quantity: '3', amount: '180' }
      ]
    })
    await waitUntilReady(page)
    await page.locator('input[type=file]').setInputFiles(photo)
    await readButton(page).click()
    await page.waitForFunction(() => document.querySelectorAll('tr.entry-row').length === 2)
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    await page.locator('tr.entry-row').first().locator('input').nth(1).fill('Rice 10kg') // an edit on page 1

    await page.getByRole('button', { name: 'Add another page' }).click()
    expect(await page.getByRole('heading', { name: 'Add another page', level: 1 }).count()).toBe(1)
    expect(await rows(page).count()).toBe(2) // page 1 stays on screen while page 2 is chosen
    await page.locator('input[type=file]').setInputFiles(photo)
    await readButton(page).click()
    await page.waitForFunction(() => document.querySelectorAll('tr.entry-row').length === 4)
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    expect(await page.locator('.entry-count').textContent()).toBe('4 entries')
    expect(await rows(page).first().locator('input').nth(1).inputValue()).toBe('Rice 10kg') // page 1 kept, edit included

    // Reading page 2 again (say, after turning it) replaces page 2 only.
    await readButton(page).click()
    await page.waitForFunction(() => document.querySelectorAll('tr.entry-row').length === 4)
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    expect(await page.locator('.entry-count').textContent()).toBe('4 entries')

    for (const box of await page.locator('.review-checkbox').all()) await box.check()
    await page.getByRole('button', { name: /Download CSV/ }).click()
    await page.getByText(/^Saved to /).waitFor()
    expect(readFileSync(savePath, 'utf8').replace('﻿', '').split('\r\n')).toEqual([
      '"Date","Item or description","Quantity","Amount"',
      '"5/10","Rice 10kg","1","1450"',
      '"5/10","Salt","3","180"',
      '"5/10","Rice 5kg","1","1450"',
      '"5/10","Salt","3","180"'
    ])

    await page.locator('.start-over').click()
    expect(await rows(page).count()).toBe(0)
    expect(await page.getByRole('heading', { name: 'Add a ledger page', level: 1 }).count()).toBe(1)
  })
})

describe('reading a page', () => {
  it('shows each row while the page is still being read, then saves the reviewed rows as a CSV', async () => {
    const { page, savePath } = await launch({
      rows: [
        { item: 'Rice 5kg', quantity: '1', amount: '1450' },
        { item: 'Bar soap', quantity: '4', amount: '', uncertain: ['amount'] },
        { item: 'Salt', quantity: '3', amount: '180' }
      ],
      rowDelayMs: 400
    })
    await waitUntilReady(page)
    expect(await readButton(page).isDisabled()).toBe(true) // no photo yet

    await page.locator('input[type=file]').setInputFiles(photo)
    await readButton(page).click()

    // Streaming: a row is on screen while the read is still running.
    await page.waitForFunction(
      () => document.querySelectorAll('tr.entry-row').length >= 1 && (document.querySelector('.primary-button') as HTMLButtonElement).disabled
    )
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('tr.entry-row').length === 3)
    expect(await page.locator('.entry-count').textContent()).toBe('3 entries')

    // The download stays locked until every row is reviewed; the unreadable amount is highlighted.
    const download = page.getByRole('button', { name: /Download CSV/ })
    expect(await download.isDisabled()).toBe(true)
    expect(await page.locator('tr.needs-review').count()).toBe(1)
    await page.locator('tr.entry-row').nth(1).locator('input').nth(3).fill('480') // fix the amount
    const markAll = page.getByRole('button', { name: 'Mark all reviewed' })
    await page.locator('.review-checkbox').first().click() // one row reviewed by hand
    await markAll.click()
    expect(await page.locator('.review-checkbox[data-state="checked"]').count()).toBe(3)
    expect(await markAll.isDisabled()).toBe(true)
    expect(await download.isDisabled()).toBe(false)
    await page.locator('tr.entry-row').nth(2).locator('input').nth(1).fill('Salt 1kg') // an edit unmarks that row
    expect(await download.isDisabled()).toBe(true)
    await page.locator('.review-checkbox').nth(2).click()
    expect(await download.isDisabled()).toBe(false)
    await download.click()
    await page.getByText(/^Saved to /).waitFor()

    const csv = readFileSync(savePath, 'utf8')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.replace('﻿', '').split('\r\n')).toEqual([
      '"Date","Item or description","Quantity","Amount"',
      '"5/10","Rice 5kg","1","1450"',
      '"5/10","Bar soap","4","480"',
      '"5/10","Salt 1kg","3","180"'
    ])

    // The request that reached Ollama kept the settings that avoid its small default context window.
    const body = fake.chatBodies[0]
    expect(body.options.num_ctx).toBeGreaterThan(4096)
    expect(body.model).toBe('qwen3-vl:2b-instruct')
    expect(body.messages[1].images[0].length).toBeGreaterThan(20)
  })

  it("highlights an amount the model was unsure of even though the model did not say so", async () => {
    const { page } = await launch({
      reportConfidence: true,
      rows: [
        { item: 'Rice', quantity: '1', amount: '1450' },
        { item: 'Eggs', quantity: '12', amount: '89', unsureAmount: true },
        { item: 'Salt', quantity: '3', amount: '180' }
      ]
    })
    await waitUntilReady(page)
    await page.locator('input[type=file]').setInputFiles(photo)
    await readButton(page).click()
    await page.waitForFunction(() => document.querySelectorAll('tr.entry-row').length === 3)
    expect(await page.locator('tr.needs-review').count()).toBe(1)
    const eggs = rows(page).nth(1)
    expect(await eggs.locator('input').nth(1).inputValue()).toBe('Eggs')
    expect(await eggs.locator('input.uncertain').count()).toBe(1)
    expect(await eggs.locator('input').nth(3).getAttribute('class')).toContain('uncertain')
    expect(fake.chatBodies[0].logprobs).toBe(true)
  })

  it('stops a model that repeats itself, keeps the rows before the loop, and says why', async () => {
    const rice = { item: 'Rice', quantity: '1', amount: '1450' }
    const salt = { item: 'Salt', quantity: '3', amount: '180' }
    const { page } = await launch({ rows: Array.from({ length: 40 }, (_, i) => (i % 2 ? salt : rice)), rowDelayMs: 20 })
    await waitUntilReady(page)
    await page.locator('input[type=file]').setInputFiles(photo)
    await readButton(page).click()
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    expect(await rows(page).count()).toBe(2)
    expect(await page.locator('.message').textContent()).toMatch(/started repeating itself.*after 2 rows/)
  })

  it('reads the photo turned when the owner says the page is sideways', async () => {
    const { page } = await launch({})
    await waitUntilReady(page)
    await page.locator('input[type=file]').setInputFiles(photo) // 64 wide, 48 tall
    await readButton(page).click()
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    expect(jpegSize(fake.chatBodies[0].messages[1].images[0])).toEqual({ width: 64, height: 48 })

    await page.getByRole('button', { name: 'Turn the photo right', exact: true }).click()
    await readButton(page).click()
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    expect(jpegSize(fake.chatBodies[1].messages[1].images[0])).toEqual({ width: 48, height: 64 })

    await page.getByRole('button', { name: 'Turn the photo left', exact: true }).click() // back to upright
    await readButton(page).click()
    await page.getByRole('button', { name: /Read this page/ }).waitFor()
    expect(jpegSize(fake.chatBodies[2].messages[1].images[0])).toEqual({ width: 64, height: 48 })
  })

  it('stops on request and keeps the rows already read', async () => {
    const { page } = await launch({ rows: [{ item: 'Rice 5kg', quantity: '1', amount: '1450' }, { item: 'Salt', quantity: '1', amount: '5' }], hangAfterFirstRow: true })
    await waitUntilReady(page)
    await page.locator('input[type=file]').setInputFiles(photo)
    await readButton(page).click()
    await page.waitForFunction(() => document.querySelectorAll('tr.entry-row').length === 1)
    await page.getByRole('button', { name: 'Stop' }).click()
    await page.getByText('Stopped. 1 row was read before you stopped.').waitFor()
    expect(await rows(page).count()).toBe(1)
    expect(await readButton(page).isDisabled()).toBe(false)
  })

  it("shows Ollama's own error and hides the empty results", async () => {
    const { page } = await launch({ chatError: { status: 400, message: 'request exceeds the available context size' } })
    await waitUntilReady(page)
    await page.locator('input[type=file]').setInputFiles(photo)
    await readButton(page).click()
    await page.getByText(/400.*exceeds the available context size/).waitFor()
    expect(await page.locator('#results').count()).toBe(0)
    expect(await readButton(page).isDisabled()).toBe(false)
  })

  it('rejects a file that is not an image without calling Ollama', async () => {
    const { page } = await launch({})
    await waitUntilReady(page)
    const text = join(directory, 'notes.txt')
    writeFileSync(text, 'not a photo')
    await page.locator('input[type=file]').setInputFiles(text)
    await page.getByText('Choose a JPEG, PNG, or WebP image.').waitFor()
    expect(fake.chatBodies).toHaveLength(0)
  })
})

describe('first run', () => {
  it('offers the one-time model download, shows progress, and becomes ready', async () => {
    const { page } = await launch({ models: [] })
    await page.getByText('One-time download: the reading model').waitFor()
    expect(await page.locator('#main').getAttribute('data-setup-phase')).toBe('need-model')
    await page.getByRole('button', { name: 'Download the model' }).click()
    await page.getByText(/Downloading the reading model · 50%/).waitFor()
    await waitUntilReady(page)
    expect(await page.locator('.setup').count()).toBe(0)
    expect(fake.pulled).toEqual(['qwen3-vl:2b-instruct'])
  })
})

describe('security', () => {
  it('keeps Node out of the page and exposes only the app bridge', async () => {
    const { page } = await launch({})
    await waitUntilReady(page)
    const exposed = await page.evaluate(() => ({
      require: typeof (window as any).require,
      process: typeof (window as any).process,
      bridge: Object.keys((window as any).ledger).sort()
    }))
    expect(exposed.require).toBe('undefined')
    expect(exposed.process).toBe('undefined')
    expect(exposed.bridge).toEqual(
      ['cancelExtract', 'defaultModel', 'extractEntries', 'getStatus', 'openDownloadPage', 'pullModel', 'saveCsv', 'startOllama', 'warmModel'].sort()
    )
  })

  it('does not let the page navigate away', async () => {
    const { page } = await launch({})
    await waitUntilReady(page)
    const before = page.url()
    await page.evaluate(() => { location.href = 'https://example.com/' })
    await page.waitForTimeout(500)
    expect(page.url()).toBe(before)
  })
})

describe('managing Ollama', () => {
  it.skipIf(!findBinary())('does not leave Ollama running if the app quits while Ollama is still starting', async () => {
    // A free port where no Ollama is listening, so the app has to start one.
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const { port } = probe.address() as { port: number }
        probe.close(() => resolve(port))
      })
    })
    const up = () => fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false)
    app = await launchApp({ OLLAMA_HOST: `127.0.0.1:${port}` })
    const page = await app.firstWindow()
    // The app has spawned Ollama. Quit right away, before it has had time to settle; whether it
    // is answering yet depends on the machine, so only the cleanup afterwards is asserted.
    await page.waitForFunction(() => document.querySelector('#main')?.getAttribute('data-setup-phase') === 'starting')
    await app.close()
    app = undefined
    await new Promise((resolve) => setTimeout(resolve, 4000))
    expect(await up(), 'Ollama was left running after the app quit').toBe(false)
  })
})
