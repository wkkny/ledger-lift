import { describe, expect, it } from 'vitest'
import { baseUrl, chatRequest, DEFAULT_MODEL, KEEP_ALIVE, LineBuffer, modelInstalled, NUM_CTX, ChatReply, parsePullLine } from './ollama'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('chatRequest', () => {
  it('streams, and keeps the context and warmth settings', () => {
    const request = chatRequest('m', 'AAAA')
    expect(request.stream).toBe(true)
    expect(request.format).toBe('json')
    expect(request.keep_alive).toBe(KEEP_ALIVE)
    expect(request.logprobs).toBe(true)
    // A ledger photo plus its answer overflows Ollama's default 4096-token context.
    expect(request.options.num_ctx).toBeGreaterThan(4096)
    expect(NUM_CTX).toBe(request.options.num_ctx)
    expect(request.messages[1].images).toEqual(['AAAA'])
  })

  it('defaults to a model that does not reason before answering', () => {
    expect(DEFAULT_MODEL.endsWith('-instruct')).toBe(true)
  })
})

describe('LineBuffer', () => {
  it('joins lines split across chunks', () => {
    const buffer = new LineBuffer()
    expect(buffer.push(bytes('{"a":'))).toEqual([])
    expect(buffer.push(bytes('1}\n{"b":2}\n{"c"'))).toEqual(['{"a":1}', '{"b":2}'])
    expect(buffer.finish()).toBe('{"c"')
    expect(buffer.finish()).toBeNull()
  })

  it('keeps a multibyte character that is split across chunks', () => {
    const all = bytes('{"item":"café"}\n')
    const split = all.indexOf(0xc3) + 1
    const buffer = new LineBuffer()
    expect(buffer.push(all.slice(0, split))).toEqual([])
    expect(buffer.push(all.slice(split))).toEqual(['{"item":"café"}'])
  })
})

describe('ChatReply', () => {
  const token = (text: string, probability = 1) => ({ token: text, logprob: Math.log(probability), bytes: [...Buffer.from(text)] })
  const line = (content: string, logprobs?: unknown[], thinking?: string) =>
    JSON.stringify({ message: { content, ...(thinking ? { thinking } : {}) }, done: false, ...(logprobs ? { logprobs } : {}) })

  it('returns the text added, or nothing for thinking-only lines', () => {
    expect(new ChatReply().push(line('hi'))).toEqual([{ text: 'hi', confidence: 1 }])
    expect(new ChatReply().push(line('', undefined, 'hm'))).toEqual([])
    expect(new ChatReply().push(line(''))).toEqual([])
  })

  it('rebuilds the text from the tokens, with each token\'s probability', () => {
    // `content` leaves out the space that the token carries.
    const pieces = new ChatReply().push(line('', [token(' "', 1), token('9', 0.5)]))
    expect(pieces.map((piece) => piece.text)).toEqual([' "', '9'])
    expect(pieces[1].confidence).toBeCloseTo(0.5)
  })

  it('keeps a character that is split across tokens whole', () => {
    const bytes = [...Buffer.from('é')]
    const halves = [bytes.slice(0, 1), bytes.slice(1)].map((half) => ({ token: '\uFFFD', logprob: 0, bytes: half }))
    const reply = new ChatReply()
    expect(reply.push(line('', [halves[0]]))).toEqual([])
    expect(reply.push(line('', [halves[1]])).map((piece) => piece.text)).toEqual(['é'])
  })

  it('ignores the probabilities of a model reasoning before its answer', () => {
    expect(new ChatReply().push(line('', [token('hmm')], 'hmm'))).toEqual([])
  })

  it('uses the content when the tokens are missing or malformed', () => {
    expect(new ChatReply().push(line('hi', []))).toEqual([{ text: 'hi', confidence: 1 }])
    expect(new ChatReply().push(line('hi', [{ token: 'hi', logprob: 'high' }]))).toEqual([{ text: 'hi', confidence: 1 }])
  })

  it('throws the error Ollama reported', () => {
    expect(() => new ChatReply().push('{"error":"request exceeds the available context size"}')).toThrow(
      'request exceeds the available context size'
    )
    expect(() => new ChatReply().push('not json')).toThrow(/Unreadable reply/)
  })
})

describe('parsePullLine', () => {
  it('reports progress and errors', () => {
    expect(parsePullLine('{"status":"pulling abc","total":100,"completed":40}')).toEqual({
      status: 'pulling abc',
      completed: 40,
      total: 100
    })
    expect(parsePullLine('{"status":"success"}').completed).toBeNull()
    expect(() => parsePullLine('{"error":"pull model manifest: file does not exist"}')).toThrow('file does not exist')
  })
})

describe('modelInstalled', () => {
  const models = ['llama3:latest', 'qwen3-vl:2b-instruct']
  it('matches the latest tag when none is given, and exact tags otherwise', () => {
    expect(modelInstalled(models, 'llama3')).toBe(true)
    expect(modelInstalled(models, 'qwen3-vl:2b-instruct')).toBe(true)
    expect(modelInstalled(models, 'qwen3-vl:2b')).toBe(false)
    expect(modelInstalled(models, 'qwen3-vl')).toBe(false)
  })
})

describe('baseUrl', () => {
  it('defaults to the local Ollama port and honours OLLAMA_HOST', () => {
    expect(baseUrl({})).toBe('http://127.0.0.1:11434')
    expect(baseUrl({ OLLAMA_HOST: '127.0.0.1:9999' })).toBe('http://127.0.0.1:9999')
    expect(baseUrl({ OLLAMA_HOST: 'localhost' })).toBe('http://localhost:11434')
    expect(baseUrl({ OLLAMA_HOST: '0.0.0.0:11434' })).toBe('http://127.0.0.1:11434')
    expect(baseUrl({ OLLAMA_HOST: 'https://ollama.example.com' })).toBe('https://ollama.example.com')
  })
})
