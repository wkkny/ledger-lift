// A small stand-in for Ollama so the real app can be driven end to end without a model.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakeOptions = {
  /** Models reported as installed; `pull` adds the wanted one. */
  models?: string[]
  /** Rows the "model" writes, one streamed piece at a time. */
  rows?: { item: string; quantity: string; amount: string; uncertain?: string[]; unsureAmount?: boolean }[]
  rowDelayMs?: number
  /** Report token probabilities as newer Ollama does; a row's `unsureAmount` makes its amount a low-probability guess. */
  reportConfidence?: boolean
  /** Reply to /api/chat with this error instead of rows. */
  chatError?: { status: number; message: string }
  /** After the first row, keep the reply open until the client disconnects. */
  hangAfterFirstRow?: boolean
}

export type FakeOllama = {
  host: string
  chatBodies: any[]
  pulled: string[]
  close(): Promise<void>
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const piece = (content: string, probability?: number) =>
  JSON.stringify({
    message: { role: 'assistant', content },
    done: false,
    ...(probability === undefined ? {} : { logprobs: [{ token: content, logprob: Math.log(probability), bytes: [...Buffer.from(content)] }] })
  }) + '\n'

export async function startFakeOllama(options: FakeOptions = {}): Promise<FakeOllama> {
  const models = [...(options.models ?? ['qwen3-vl:2b-instruct'])]
  const rows = options.rows ?? [{ item: 'Rice 5kg', quantity: '1', amount: '1450' }]
  const state = { chatBodies: [] as any[], pulled: [] as string[] }

  async function chat(request: IncomingMessage, response: ServerResponse, body: any) {
    state.chatBodies.push(body)
    if (options.chatError) return json(response, options.chatError.status, { error: options.chatError.message })
    let open = true
    request.on('close', () => (open = false))
    response.write(JSON.stringify({ message: { role: 'assistant', thinking: 'hmm' }, done: false }) + '\n')
    response.write(piece('{"entries": ['))
    for (const [index, row] of rows.entries()) {
      const uncertain = JSON.stringify(row.uncertain ?? [])
      const p = options.reportConfidence ? 0.999 : undefined
      const object = [
        [`${index > 0 ? ',' : ''}{"date": "5/10", "item": "${row.item}", "quantity": "${row.quantity}", "amount": "`, p],
        [row.amount, options.reportConfidence && row.unsureAmount ? 0.5 : p],
        [`", "uncertain_fields": ${uncertain}}`, p]
      ] as const
      for (const [text, probability] of object) if (text) response.write(piece(text, probability))
      if (options.hangAfterFirstRow && index === 0) {
        while (open) await sleep(50)
        return
      }
      await sleep(options.rowDelayMs ?? 30)
    }
    response.write(piece(']}'))
    response.end(JSON.stringify({ done: true }) + '\n')
  }

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString()
      const body = raw ? JSON.parse(raw) : undefined
      if (request.url === '/api/version') return json(response, 200, { version: 'fake' })
      if (request.url === '/api/tags') return json(response, 200, { models: models.map((name) => ({ name })) })
      if (request.url === '/api/generate') return json(response, 200, { done: true })
      if (request.url === '/api/chat') return void chat(request, response, body)
      if (request.url === '/api/pull') {
        void (async () => {
          for (const percent of [0, 50, 100]) {
            response.write(JSON.stringify({ status: 'pulling fake', total: 100, completed: percent }) + '\n')
            await sleep(150)
          }
          models.push(body.model)
          state.pulled.push(body.model)
          response.end(JSON.stringify({ status: 'success' }) + '\n')
        })()
        return
      }
      json(response, 404, { error: 'not found' })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    host: `127.0.0.1:${(server.address() as AddressInfo).port}`,
    chatBodies: state.chatBodies,
    pulled: state.pulled,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()) })
  }
}
