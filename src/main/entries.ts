// Turning the model's streamed JSON into cleaned ledger entries.

import type { Entry } from '../shared/types'

export const FIELDS = ['date', 'item', 'quantity', 'amount'] as const
const MAX_FIELD_CHARS = 500

function fieldText(value: unknown): string {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  return [...text].slice(0, MAX_FIELD_CHARS).join('')
}

/** Cleans one model-produced object. Returns null if it is not an object. */
export function cleanEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const object = value as Record<string, unknown>
  const named = Array.isArray(object.uncertain_fields) ? object.uncertain_fields : []
  return {
    date: fieldText(object.date),
    item: fieldText(object.item),
    quantity: fieldText(object.quantity),
    amount: fieldText(object.amount),
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

  /** Adds streamed text and returns every entry completed by it. */
  push(text: string): Entry[] {
    this.buffer += text
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
            const entry = this.parse(this.buffer.slice(this.entryStart, index + 1))
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

  private parse(text: string): Entry | null {
    try {
      return cleanEntry(JSON.parse(text))
    } catch {
      return null
    }
  }
}
