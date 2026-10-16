import { describe, expect, it } from 'vitest'
import { cleanEntry, EntryStream } from './entries'

const entry = (date: string, item: string, quantity: string, amount: string) => ({
  date,
  item,
  quantity,
  amount,
  uncertainFields: []
})

const PAGE = `{"entries": [
  {"date": "5/10", "item": "Rice 5kg", "quantity": "1", "amount": "1450", "uncertain_fields": []},
  {"date": "5/10", "item": "Salt", "quantity": "3", "amount": "180", "uncertain_fields": ["amount"]}
]}`

describe('EntryStream', () => {
  it('emits entries from a complete document', () => {
    const entries = new EntryStream().push(PAGE)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual(entry('5/10', 'Rice 5kg', '1', '1450'))
    expect(entries[1].uncertainFields).toEqual(['amount'])
  })

  it('emits each entry as soon as its closing brace arrives, exactly once', () => {
    const stream = new EntryStream()
    const perChunk: number[] = []
    for (let start = 0; start < PAGE.length; start += 7) perChunk.push(stream.push(PAGE.slice(start, start + 7)).length)
    expect(perChunk.reduce((a, b) => a + b, 0)).toBe(2)
    expect(Math.max(...perChunk)).toBeLessThanOrEqual(1)
  })

  it('is not confused by braces and quotes inside strings', () => {
    const entries = new EntryStream().push(
      '{"entries": [{"date": "1/2", "item": "Tea \\"loose\\" {2 for 1}", "quantity": "1", "amount": "5", "uncertain_fields": []}]}'
    )
    expect(entries).toHaveLength(1)
    expect(entries[0].item).toBe('Tea "loose" {2 for 1}')
  })

  it('never emits a truncated entry', () => {
    expect(new EntryStream().push('{"entries": [{"date": "1/2", "item": "Rice", "quantity": "1", "am')).toEqual([])
  })

  it('also reads a top-level array', () => {
    const entries = new EntryStream().push('[{"date": "1/2", "item": "Rice", "quantity": "1", "amount": "5"}]')
    expect(entries).toEqual([entry('1/2', 'Rice', '1', '5')])
  })

  it('yields nothing for an empty list', () => {
    expect(new EntryStream().push('{"entries": []}')).toEqual([])
  })

  it('keeps accents and emoji intact when text arrives in pieces', () => {
    const stream = new EntryStream()
    const text = '{"entries": [{"date": "1/2", "item": "Café ☕ crème", "quantity": "1", "amount": "5"}]}'
    const entries = [...text].flatMap((char) => stream.push(char))
    expect(entries[0].item).toBe('Café ☕ crème')
  })
})

describe('cleanEntry', () => {
  it('turns numbers into text and missing fields into empty text', () => {
    const cleaned = cleanEntry({ date: '1/2', item: 'Rice', quantity: 2, amount: null })
    expect(cleaned?.quantity).toBe('2')
    expect(cleaned?.amount).toBe('')
  })

  it('drops unknown uncertain fields and cuts very long values', () => {
    const cleaned = cleanEntry({ item: 'x'.repeat(900), uncertain_fields: ['item', 'colour', 7] })
    expect(cleaned?.uncertainFields).toEqual(['item'])
    expect([...(cleaned?.item ?? '')]).toHaveLength(500)
  })

  it('rejects values that are not objects', () => {
    expect(cleanEntry('rice')).toBeNull()
    expect(cleanEntry(null)).toBeNull()
    expect(cleanEntry([1])).toBeNull()
  })
})
