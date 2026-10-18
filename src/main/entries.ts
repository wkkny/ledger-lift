// Turning the model's streamed JSON into cleaned ledger entries.

import type { Entry } from '../shared/types'

export const FIELDS = ['date', 'item', 'quantity', 'amount'] as const
const MAX_FIELD_CHARS = 500

/**
 * A digit the model was less sure of than this makes its field need a second look. On one handwritten page the
 * digits it got right were all above 0.99 and a digit that turned out to be a misread was at 0.68, so this sits
 * between them. Re-check it against more pages before leaning on it.
 */
export const LOW_CONFIDENCE = 0.9
/** Fields whose digits are checked. Words vary in how they are tokenized, so only numbers are judged this way. */
const NUMERIC_FIELDS = ['date', 'quantity', 'amount'] as const

function fieldText(value: unknown): string {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  return [...text].slice(0, MAX_FIELD_CHARS).join('')
}

/** Shopkeepers write a whole-number total as `400/-` or `400/`. The ending is not part of the number. */
const stripTotalMark = (amount: string) => amount.replace(/(\d)\s*\/\s*[-=]?\s*$/, '$1')

/** Cleans one model-produced object. Returns null if it is not an object. */
export function cleanEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const object = value as Record<string, unknown>
  const named = Array.isArray(object.uncertain_fields) ? object.uncertain_fields : []
  return {
    date: fieldText(object.date),
    item: fieldText(object.item),
    quantity: fieldText(object.quantity),
    amount: stripTotalMark(fieldText(object.amount)),
    uncertainFields: FIELDS.filter((field) => named.includes(field))
  }
}

/**
 * Incrementally reads entry objects out of a streamed `{"entries": [ {...}, {...} ]}` document,
 * so each row can be shown as soon as the model finishes writing it.
 */
export class EntryStream {
  private buffer = ''
  private scanned = 0
  private depth = 0
  private inString = false
  private escaped = false
  /** Nesting depth of the entries array, set when the first `[` is seen. */
  private arrayDepth: number | null = null
  private entryStart: number | null = null
  /** How sure the model was of each character in `buffer`; 1 where it didn't say. */
  private confidence: number[] = []

  /**
   * Adds streamed text and returns every entry completed by it. `confidence` (0 to 1) is how sure the model was
   * of this piece of text, when Ollama reports it.
   */
  push(text: string, confidence = 1): Entry[] {
    this.buffer += text
    for (let i = 0; i < text.length; i++) this.confidence.push(confidence)
    const entries: Entry[] = []
    while (this.scanned < this.buffer.length) {
      const index = this.scanned++
      const char = this.buffer[index]
      if (this.inString) {
        if (this.escaped) this.escaped = false
        else if (char === '\\') this.escaped = true
        else if (char === '"') this.inString = false
        continue
      }
      switch (char) {
        case '"':
          this.inString = true
          break
        case '[':
          this.depth += 1
          if (this.arrayDepth === null) this.arrayDepth = this.depth
          break
        case ']':
          this.depth = Math.max(0, this.depth - 1)
          break
        case '{':
          this.depth += 1
          if (this.arrayDepth !== null && this.depth === this.arrayDepth + 1) this.entryStart = index
          break
        case '}': {
          const closesEntry = this.arrayDepth !== null && this.depth === this.arrayDepth + 1
          if (closesEntry && this.entryStart !== null) {
            const entry = this.parse(this.entryStart, index + 1)
            if (entry) entries.push(entry)
            this.entryStart = null
          }
          this.depth = Math.max(0, this.depth - 1)
          break
        }
      }
    }
    return entries
  }

  private parse(start: number, end: number): Entry | null {
    const text = this.buffer.slice(start, end)
    let entry: Entry | null
    try {
      entry = cleanEntry(JSON.parse(text))
    } catch {
      return null
    }
    if (!entry) return null
    const doubtful = this.doubtfulFields(text, start)
    entry.uncertainFields = FIELDS.filter((field) => entry.uncertainFields.includes(field) || doubtful.has(field))
    return entry
  }

  /** The numeric fields in which the model was unsure of a digit. `start` is where `text` begins in the buffer. */
  private doubtfulFields(text: string, start: number): Set<string> {
    const doubtful = new Set<string>()
    for (const field of NUMERIC_FIELDS) {
      const match = new RegExp(`"${field}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|-?[\\d.,]+)`).exec(text)
      if (!match) continue
      const from = start + match.index + match[0].length - match[1].length
      for (let i = from; i < from + match[1].length; i++) {
        if (/\d/.test(this.buffer[i]) && this.confidence[i] < LOW_CONFIDENCE) doubtful.add(field)
      }
    }
    return doubtful
  }
}
