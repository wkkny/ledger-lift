// Runs the client against a small fake Ollama server, so streaming, stopping and errors can be tested
// without a model.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Entry } from '../shared/types'
import { extract, pull, status } from './ollama'

type Handler = (request: IncomingMessage, response: ServerResponse, body: unknown) => void | Promise<void>

let server: Server
let handler: Handler
let lastChatBody: any

const row = (item: string) => `{"date": "5/10", "item": "${item}", "quantity": "1", "amount": "10", "uncertain_fields": []}`
const chatLine = (content: string) => JSON.stringify({ message: { role: 'assistant', content }, done: false }) + '\n'
const thinkingLine = () => JSON.stringify({ message: { role: 'assistant', thinking: 'hmm' }, done: false }) + '\n'

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString()
      void handler(request, response, text ? JSON.parse(text) : undefined)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.env.OLLAMA_HOST = `127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  delete process.env.OLLAMA_HOST
})

beforeEach(() => {
  lastChatBody = undefined
})

describe('extract', () => {
  it('delivers each row while the model is still writing the rest', async () => {
    let releaseRest!: () => void
    const restReleased = new Promise<void>((resolve) => (releaseRest = resolve))
    handler = async (_request, response, body) => {
      lastChatBody = body
      response.write(thinkingLine())
      response.write(chatLine(`{"entries": [${row('Rice')},`))
      await restReleased // the client must show the first row before we send anything more
      response.write(chatLine(`${row('Salt')}]}`))
      response.end(JSON.stringify({ done: true }) + '\n')
    }
    const seen: Entry[] = []
    const outcome = await extract('m', 'AAAA', new AbortController().signal, (entry) => {
      seen.push(entry)
      if (seen.length === 1) releaseRest()
    })
    expect(outcome).toEqual({ count: 2, cancelled: false })
    expect(seen.map((entry) => entry.item)).toEqual(['Rice', 'Salt'])
    expect(lastChatBody.options.num_ctx).toBeGreaterThan(4096)
    expect(lastChatBody.messages[1].images).toEqual(['AAAA'])
  })

  it('stops when asked and keeps the rows already read', async () => {
    handler = async (_request, response) => {
      response.write(chatLine(`{"entries": [${row('Rice')},`))
      await new Promise((resolve) => setTimeout(resolve, 5000)) // never finishes on its own
      response.end()
    }
    const controller = new AbortController()
    const outcome = await extract('m', 'AAAA', controller.signal, () => controller.abort())
    expect(outcome).toEqual({ count: 1, cancelled: true })
  })

  it("explains Ollama's own error, such as an oversized image", async () => {
    handler = (_request, response) => {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'request (8860 tokens) exceeds the available context size (4096 tokens)' }))
    }
    await expect(extract('m', 'AAAA', new AbortController().signal, () => {})).rejects.toThrow(
      /400.*exceeds the available context size/
    )
  })

  it('reports an error the model streams after it has started', async () => {
    handler = (_request, response) => {
      response.write(chatLine('{"entries": ['))
      response.end(JSON.stringify({ error: 'model runner has unexpectedly stopped' }) + '\n')
    }
    await expect(extract('m', 'AAAA', new AbortController().signal, () => {})).rejects.toThrow('unexpectedly stopped')
  })

  it('rejects an empty image and a blank model name before calling Ollama', async () => {
    await expect(extract('m', '', new AbortController().signal, () => {})).rejects.toThrow(/empty or too large/)
    await expect(extract('  ', 'AAAA', new AbortController().signal, () => {})).rejects.toThrow(/valid Ollama model/)
  })

  it('says Ollama is unreachable when nothing is listening', async () => {
    const saved = process.env.OLLAMA_HOST
    process.env.OLLAMA_HOST = '127.0.0.1:1'
    try {
      await expect(extract('m', 'AAAA', new AbortController().signal, () => {})).rejects.toThrow(/Couldn't reach Ollama/)
    } finally {
      process.env.OLLAMA_HOST = saved
    }
  })
})

describe('status', () => {
  it('reports the installed models and whether the wanted one is among them', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ models: [{ name: 'qwen3-vl:2b-instruct' }, { name: 'llama3:latest' }] }))
    }
    const found = await status('qwen3-vl:2b-instruct')
    expect(found).toMatchObject({ running: true, modelReady: true, models: ['qwen3-vl:2b-instruct', 'llama3:latest'] })
    expect((await status('qwen3-vl:2b')).modelReady).toBe(false)
  })

  it('reports not running when nothing is listening', async () => {
    const saved = process.env.OLLAMA_HOST
    process.env.OLLAMA_HOST = '127.0.0.1:1'
    try {
      expect(await status('m')).toMatchObject({ running: false, models: [], modelReady: false })
    } finally {
      process.env.OLLAMA_HOST = saved
    }
  })
})

describe('pull', () => {
  it('forwards progress in order and surfaces a failed download', async () => {
    handler = (_request, response) => {
      response.write('{"status":"pulling manifest"}\n')
      response.write('{"status":"pulling abc","total":100,"completed":40}\n')
      response.end('{"status":"success"}\n')
    }
    const seen: string[] = []
    await pull('m', (progress) => seen.push(`${progress.status}:${progress.completed ?? '-'}`))
    expect(seen).toEqual(['pulling manifest:-', 'pulling abc:40', 'success:-'])

    handler = (_request, response) => {
      response.write('{"status":"pulling manifest"}\n')
      response.end('{"error":"pull model manifest: file does not exist"}\n')
    }
    await expect(pull('nope', () => {})).rejects.toThrow('file does not exist')
  })
})
