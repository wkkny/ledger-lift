import type { ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell, type IpcMainInvokeEvent } from 'electron'
import type { Entry } from '../shared/types'
import { toCsv } from './csv'
import * as ollama from './ollama'

const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'
const DEV_URL = process.env.ELECTRON_RENDERER_URL

/** The Ollama process this app started, if any. Stopped when the app quits. */
let ollamaProcess: ChildProcess | null = null
let starting: Promise<void> | null = null
let currentExtract: AbortController | null = null

const text = (value: unknown, name: string): string => {
  if (typeof value !== 'string') throw new Error(`Invalid ${name}.`)
  return value
}

/** Replies are plain `{ ok, value | error }` so the interface gets the original message, not Electron's wrapper. */
function handle<T>(channel: string, run: (event: IpcMainInvokeEvent, ...args: unknown[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, value: await run(event, ...args) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

function startOllama(): Promise<void> {
  starting ??= (async () => {
    if (await ollama.isRunning()) return
    await ollama.start((child) => (ollamaProcess = child))
  })().finally(() => (starting = null))
  return starting
}

function toEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) throw new Error('Invalid entries.')
  return value.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>
    return { date: String(row.date ?? ''), item: String(row.item ?? ''), quantity: String(row.quantity ?? ''), amount: String(row.amount ?? ''), uncertainFields: [] }
  })
}

function registerIpc(): void {
  handle('ledger:default-model', () => ollama.DEFAULT_MODEL)
  handle('ledger:status', (_event, model) => ollama.status(text(model, 'model')))
  handle('ledger:start-ollama', startOllama)
  handle('ledger:warm', (_event, model) => ollama.warm(text(model, 'model').trim()))
  handle('ledger:pull', (event, model, id) =>
    ollama.pull(text(model, 'model').trim(), (progress) => event.sender.send('ledger:pull-progress', id, progress))
  )
  handle('ledger:extract', async (event, image, model, id) => {
    currentExtract?.abort()
    const controller = (currentExtract = new AbortController())
    try {
      const outcome = await ollama.extract(text(model, 'model'), text(image, 'image'), controller.signal, (entry) =>
        event.sender.send('ledger:extract-entry', id, entry)
      )
      if (outcome.count === 0 && !outcome.cancelled) throw new Error('No sales rows found. Try a closer, brighter photo.')
      return outcome
    } finally {
      if (currentExtract === controller) currentExtract = null
    }
  })
  handle('ledger:cancel', () => currentExtract?.abort())
  handle('ledger:save-csv', async (event, entries, suggestedName) => {
    const rows = toEntries(entries)
    const name = text(suggestedName, 'file name').replace(/[\\/:*?"<>|]/g, '-')
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { defaultPath: join(app.getPath('documents'), name), filters: [{ name: 'CSV', extensions: ['csv'] }] }
    const { canceled, filePath } = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return null
    try {
      await writeFile(filePath, toCsv(rows), 'utf8')
    } catch (error) {
      throw new Error(`Couldn't save the file: ${error instanceof Error ? error.message : error}`)
    }
    return filePath
  })
  handle('ledger:open-download-page', () => shell.openExternal(OLLAMA_DOWNLOAD_URL))
}

function createWindow(): void {
  const window = new BrowserWindow({
    title: 'Ledger Lift',
    width: 1000,
    height: 860,
    minWidth: 520,
    minHeight: 600,
    show: false,
    // Matches the interface's background so there is no flash before it loads.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  // Tests run the real app without putting a window on the owner's screen.
  if (!process.env.LEDGER_HIDE_WINDOW) window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!DEV_URL || !url.startsWith(DEV_URL)) event.preventDefault()
  })
  if (DEV_URL) void window.loadURL(DEV_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  // A second copy would start a second Ollama.
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  void app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => {
    currentExtract?.abort()
    ollamaProcess?.kill()
  })
}
