import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Entry, ExtractOutcome, LedgerApi, PullProgress } from '../shared/types'

type Reply<T> = { ok: true; value: T } | { ok: false; error: string }

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const reply: Reply<T> = await ipcRenderer.invoke(channel, ...args)
  if (!reply.ok) throw new Error(reply.error)
  return reply.value
}

/** Calls `channel` and forwards the events the main process sends for this call while it runs. */
function callWithEvents<T, E>(channel: string, eventChannel: string, args: unknown[], onEvent: (event: E) => void): Promise<T> {
  const id = `${Date.now()}-${Math.random()}`
  const listener = (_event: IpcRendererEvent, eventId: string, payload: E) => {
    if (eventId === id) onEvent(payload)
  }
  ipcRenderer.on(eventChannel, listener)
  return call<T>(channel, ...args, id).finally(() => ipcRenderer.removeListener(eventChannel, listener))
}

const api: LedgerApi = {
  defaultModel: () => call('ledger:default-model'),
  getStatus: (model) => call('ledger:status', model),
  startOllama: () => call('ledger:start-ollama'),
  warmModel: (model) => call('ledger:warm', model),
  pullModel: (model, onProgress) => callWithEvents<void, PullProgress>('ledger:pull', 'ledger:pull-progress', [model], onProgress),
  extractEntries: (image, model, onEntry) =>
    callWithEvents<ExtractOutcome, Entry>('ledger:extract', 'ledger:extract-entry', [image, model], onEntry),
  cancelExtract: () => call('ledger:cancel'),
  saveCsv: (entries, suggestedName) => call('ledger:save-csv', entries, suggestedName),
  openDownloadPage: () => call('ledger:open-download-page')
}

contextBridge.exposeInMainWorld('ledger', api)
