// Everything that talks to, or manages, the Ollama service on the owner's computer.

import { spawn, type ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { Agent, fetch, type Response } from 'undici'
import type { Entry, ExtractOutcome, PullProgress, Status } from '../shared/types'
import { EntryStream } from './entries'
import { RepeatGuard } from './repeats'

/** The plain `-instruct` tag. The default `qwen3-vl:2b` tag reasons for 30-100 s before answering. */
export const DEFAULT_MODEL = 'qwen3-vl:2b-instruct'
/** Ollama's default 4096-token context is too small for a ledger photo plus its JSON answer. */
export const NUM_CTX = 8192
/** Keeps the model loaded between pages so only the first page after a break pays the load time. */
export const KEEP_ALIVE = '30m'
const MAX_IMAGE_BASE64_CHARS = 16 * 1024 * 1024

const SYSTEM_PROMPT = `You extract handwritten sales ledger rows from a single page image.
Return only a JSON object with an \`entries\` array. Each entry must have \`date\`, \`item\`,
\`quantity\`, \`amount\`, and \`uncertain_fields\`. Use strings for values exactly as written;
use an empty string when a value is missing or cannot be read. \`uncertain_fields\` is an
array containing any of date, item, quantity, amount that you could not read confidently.
\`amount\` is what the sale came to: when the page has both a unit price and a total, use the
total, not the unit price. When a date cell holds a ditto mark (a quote mark or two commas)
or is empty, use the date from the row above. Skip days marked Nil or left blank.
Do not invent values, calculate totals, normalize dates, or merge separate rows. Ignore
headers, totals, and notes that are not individual sales. Keep entries in page order.`

// Replies stream for as long as the model needs, so no overall time limit; only the connection is bounded.
const dispatcher = new Agent({ connect: { timeout: 3000 }, headersTimeout: 0, bodyTimeout: 0 })

/** Where Ollama listens: the owner's OLLAMA_HOST if they set one (as the Ollama CLI does), else the default. */
export function baseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.OLLAMA_HOST?.trim()
  if (!raw) return 'http://127.0.0.1:11434'
  const hasScheme = /^https?:\/\//.test(raw)
  const url = new URL(hasScheme ? raw : `http://${raw}`)
  if (url.hostname === '0.0.0.0') url.hostname = '127.0.0.1'
  if (!hasScheme && !url.port) url.port = '11434'
  return url.origin
}

const request = (path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}) =>
  fetch(`${baseUrl()}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
    dispatcher
  })

const unreachable = (error: unknown) =>
  new Error(`Couldn't reach Ollama. Make sure it is running and try again. (${error instanceof Error ? (error.cause ?? error) : error})`)

async function apiError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => '')
  let detail = body
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    if (typeof parsed.error === 'string') detail = parsed.error
  } catch {
    // keep the raw body
  }
  return new Error(`Ollama returned an error (${response.status} ${response.statusText}). ${detail.slice(0, 300)}`)
}

/** Splits a byte stream of newline-delimited JSON into complete lines, even across multibyte characters. */
export class LineBuffer {
  private pending = ''
  private decoder = new TextDecoder()

  push(bytes: Uint8Array): string[] {
    this.pending += this.decoder.decode(bytes, { stream: true })
    const parts = this.pending.split('\n')
    this.pending = parts.pop() ?? ''
    return parts.map((part) => part.trim()).filter(Boolean)
  }

  /** The final line, if the stream ended without a trailing newline. */
  finish(): string | null {
    const text = (this.pending + this.decoder.decode()).trim()
    this.pending = ''
    return text || null
  }
}

function parseLine(line: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch (error) {
    throw new Error(`Unreadable reply from Ollama: ${error instanceof Error ? error.message : error}`)
  }
  const object = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  if (typeof object.error === 'string') throw new Error(object.error)
  return object
}

/** A piece of the model's reply, with how sure the model was of it (0 to 1; 1 when Ollama didn't say). */
export type ReplyPiece = { text: string; confidence: number }

/**
 * Turns streamed chat lines into pieces of the model's reply, or throws the error Ollama reported instead.
 * When Ollama reports token probabilities, the text is rebuilt from the tokens themselves: the `content` it
 * streams holds back whitespace and can't be matched to tokens, but each token's bytes can.
 */
export class ChatReply {
  private decoder = new TextDecoder()

  push(line: string): ReplyPiece[] {
    const object = parseLine(line)
    const message = object.message as { content?: unknown; thinking?: unknown } | undefined
    // A model that reasons first reports probabilities for those words too; they are not part of the answer.
    if (typeof message?.thinking === 'string' && message.thinking) return []
    const tokens = tokenList(object.logprobs)
    if (tokens) {
      return tokens.flatMap(({ bytes, logprob }) => {
        const text = this.decoder.decode(Uint8Array.from(bytes), { stream: true })
        return text ? [{ text, confidence: Math.exp(logprob) }] : []
      })
    }
    return typeof message?.content === 'string' && message.content ? [{ text: message.content, confidence: 1 }] : []
  }
}

function tokenList(value: unknown): { bytes: number[]; logprob: number }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const tokens = value.map((item) => item as { bytes?: unknown; logprob?: unknown } | null)
  const usable = tokens.every(
    (token) => Array.isArray(token?.bytes) && token.bytes.every((byte) => Number.isInteger(byte)) && typeof token.logprob === 'number'
  )
  return usable ? (tokens as { bytes: number[]; logprob: number }[]) : null
}

export function parsePullLine(line: string): PullProgress {
  const object = parseLine(line)
  const count = (value: unknown) => (typeof value === 'number' ? value : null)
  return {
    status: typeof object.status === 'string' ? object.status : '',
    completed: count(object.completed),
    total: count(object.total)
  }
}

export function chatRequest(model: string, imageBase64: string) {
  return {
    model,
    stream: true,
    format: 'json',
    logprobs: true, // lets a digit the model was unsure of be marked for review
    keep_alive: KEEP_ALIVE,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: 'Extract the sales entries from this ledger page.', images: [imageBase64] }
    ],
    options: { temperature: 0, num_ctx: NUM_CTX }
  }
}

export function modelInstalled(models: string[], model: string): boolean {
  return models.includes(model.includes(':') ? model : `${model}:latest`)
}

function candidateBinaries(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string[] {
  const name = platform === 'win32' ? 'ollama.exe' : 'ollama'
  const onPath = (env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, name))
  // An app launched from the Dock or Start menu gets a minimal PATH, so also check the usual installs.
  const usual = ['/opt/homebrew/bin/ollama', '/usr/local/bin/ollama', '/Applications/Ollama.app/Contents/Resources/ollama']
  if (env.LOCALAPPDATA) usual.push(join(env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe'))
  return [...onPath, ...usual]
}

const isFile = (path: string) => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export const findBinary = (): string | null => candidateBinaries().find(isFile) ?? null

export async function isRunning(): Promise<boolean> {
  try {
    const response = await request('/api/version', { signal: AbortSignal.timeout(2000) })
    await response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}

export async function status(model: string): Promise<Status> {
  const binaryFound = findBinary() !== null
  try {
    const response = await request('/api/tags', { signal: AbortSignal.timeout(2000) })
    if (!response.ok) throw new Error(String(response.status))
    const body = (await response.json()) as { models?: { name?: unknown }[] }
    const models = (body.models ?? []).map((entry) => entry.name).filter((name): name is string => typeof name === 'string')
    return { running: true, binaryFound, models, modelReady: modelInstalled(models, model) }
  } catch {
    return { running: false, binaryFound, models: [], modelReady: false }
  }
}

/**
 * Starts `ollama serve` and waits until it answers. `onSpawn` gets the process the moment it exists, so the
 * caller can stop it on quit even if the app closes while Ollama is still starting up.
 */
export async function start(onSpawn: (child: ChildProcess) => void): Promise<void> {
  const binary = findBinary()
  if (!binary) throw new Error('Ollama is not installed on this computer.')
  const child = spawn(binary, ['serve'], { stdio: 'ignore', windowsHide: true })
  onSpawn(child)
  let failure: Error | null = null
  child.on('error', (error) => (failure = new Error(`Couldn't start Ollama: ${error.message}`)))
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await isRunning()) return
    if (failure) throw failure
    if (child.exitCode !== null) {
      throw new Error('Ollama stopped right after starting. Try opening the Ollama app once, then retry.')
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  child.kill()
  throw new Error('Ollama did not start within 20 seconds.')
}

async function* lines(response: Response, interrupted: string): AsyncGenerator<string> {
  const buffer = new LineBuffer()
  try {
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) yield* buffer.push(chunk)
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new Error(`${interrupted} (${error instanceof Error ? (error.cause ?? error) : error})`)
  }
  const last = buffer.finish()
  if (last) yield last
}

export async function pull(model: string, onProgress: (progress: PullProgress) => void): Promise<void> {
  const response = await request('/api/pull', { body: { model, stream: true } }).catch((error) => {
    throw unreachable(error)
  })
  if (!response.ok) throw await apiError(response)
  for await (const line of lines(response, 'The download was interrupted.')) onProgress(parsePullLine(line))
}

/** Loads the model into memory ahead of the first page. Failures are not worth reporting. */
export async function warm(model: string): Promise<void> {
  try {
    const response = await request('/api/generate', {
      body: { model, keep_alive: KEEP_ALIVE },
      signal: AbortSignal.timeout(120_000)
    })
    await response.body?.cancel()
  } catch {
    // The first page will simply load the model itself.
  }
}

/** Streams one extraction, calling `onEntry` as each row is finished. Aborting `signal` stops it early. */
export async function extract(
  model: string,
  imageBase64: string,
  signal: AbortSignal,
  onEntry: (entry: Entry) => void
): Promise<ExtractOutcome> {
  if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_CHARS) throw new Error('The image is empty or too large.')
  const name = model.trim()
  if (!name || name.length > 120) throw new Error('Enter a valid Ollama model name.')

  let count = 0
  let repeating = false
  // Aborted from here when the model starts looping; `signal` is the owner pressing Stop.
  const stopLoop = new AbortController()
  const emit = (entries: Entry[]) => {
    for (const entry of entries) {
      count += 1
      onEntry(entry)
    }
  }
  try {
    const response = await request('/api/chat', { body: chatRequest(name, imageBase64), signal: AbortSignal.any([signal, stopLoop.signal]) }).catch(
      (error) => {
        if ((error as Error).name === 'AbortError') throw error
        throw unreachable(error)
      }
    )
    if (!response.ok) throw await apiError(response)
    const entries = new EntryStream()
    const reply = new ChatReply()
    const guard = new RepeatGuard()
    reading: for await (const line of lines(response, 'The connection to Ollama was interrupted.')) {
      for (const piece of reply.push(line)) {
        for (const entry of entries.push(piece.text, piece.confidence)) {
          const { release, looping } = guard.push(entry)
          emit(release)
          if (looping) {
            repeating = true
            stopLoop.abort()
            break reading
          }
        }
      }
    }
    emit(guard.finish())
    return { count, cancelled: false, repeating }
  } catch (error) {
    if (repeating && !signal.aborted) return { count, cancelled: false, repeating }
    if ((error as Error).name === 'AbortError' || signal.aborted) return { count, cancelled: true, repeating: false }
    throw error
  }
}
