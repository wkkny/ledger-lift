/** A fake app so the interface can be opened in a plain browser (`pnpm web`). Never bundled into builds.
 * Pick a starting screen with ?scenario=missing-ollama | need-model | empty | error (default: ready),
 * slow the rows down with ?rowDelay=<milliseconds>, and set how long the pretend
 * Ollama install takes with ?installTime=<milliseconds>. */
import type { Entry, LedgerApi } from '@shared/types'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const ROWS: Entry[] = [
  { date: '5/10', item: 'Cooking oil 2L', quantity: '3', amount: '2940', uncertainFields: [] },
  { date: '5/10', item: 'Biscuits', quantity: '4', amount: '600', uncertainFields: [] },
  { date: '5/10', item: 'Bar soap', quantity: '4', amount: '', uncertainFields: ['amount'] },
  { date: '5/10', item: 'Lentils 1kg', quantity: '4', amount: '1520', uncertainFields: [] },
  { date: '5/10', item: 'Rice 5kg', quantity: '1', amount: '1450', uncertainFields: [] }
]

export function installDevBackend(): void {
  const params = new URLSearchParams(location.search)
  const scenario = params.get('scenario') ?? 'ready'
  const rowDelay = Number(params.get('rowDelay') ?? 700)
  let installed = scenario !== 'missing-ollama'
  let running = scenario !== 'missing-ollama'
  let modelInstalled = scenario !== 'need-model'
  let cancelled = false
  const test = window as unknown as { __saved?: unknown; __calls: string[] }
  test.__calls = []
  const track = (name: string) => test.__calls.push(name)

  const fake: LedgerApi = {
    async defaultModel() {
      return 'qwen3-vl:2b-instruct'
    },
    async getStatus() {
      await sleep(300)
      return {
        running,
        binaryFound: installed,
        models: modelInstalled ? ['qwen3-vl:2b-instruct', 'llava:7b', 'minicpm-v:8b'] : [],
        modelReady: running && modelInstalled
      }
    },
    async startOllama() {
      track('startOllama')
      await sleep(800)
      running = true
    },
    async warmModel() {
      track('warmModel')
    },
    async pullModel(_model, onProgress) {
      track('pullModel')
      for (const percent of [0, 20, 55, 90, 100]) {
        onProgress({ status: 'pulling model', completed: percent * 19_000_000, total: 1_900_000_000 })
        await sleep(500)
      }
      modelInstalled = true
    },
    async extractEntries(_image, _model, onEntry) {
      cancelled = false
      await sleep(600)
      if (scenario === 'error') throw new Error('Ollama returned an error (400 Bad Request). request exceeds the available context size')
      if (scenario === 'empty') throw new Error('No sales rows found. Try a closer, brighter photo.')
      let count = 0
      for (const row of ROWS) {
        if (cancelled) return { count, cancelled: true, repeating: false }
        onEntry(row)
        count += 1
        await sleep(rowDelay)
      }
      return { count, cancelled: false, repeating: false }
    },
    async cancelExtract() {
      cancelled = true
    },
    async saveCsv(entries, suggestedName) {
      test.__saved = { entries, suggestedName }
      return '/Users/demo/Documents/ledger-entries.csv'
    },
    async openDownloadPage() {
      track('openDownloadPage')
      // Pretend the owner runs the installer, which finishes a few seconds later and starts Ollama.
      setTimeout(() => {
        installed = true
        running = true
      }, Number(params.get('installTime') ?? 5000))
    }
  }
  window.ledger = fake
}
