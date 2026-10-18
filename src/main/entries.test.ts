import { describe, expect, it } from 'vitest'
import { cleanEntry, EntryStream, LOW_CONFIDENCE } from './entries'

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

describe('EntryStream confidence', () => {
  /** Streams a page one character at a time, giving the characters at `unsure` positions a low probability. */
  const stream = (text: string, unsure: (index: number) => boolean) => {
    const entries = new EntryStream()
    return [...text].flatMap((char, index) => entries.push(char, unsure(index) ? LOW_CONFIDENCE - 0.2 : 0.999))
  }
  const page = (amount: string, item = 'Eggs') =>
    `{"entries": [{"date": "13 March", "item": "${item}", "quantity": "12", "amount": ${amount}, "uncertain_fields": []}]}`

  it('marks a field whose digit the model was unsure of', () => {
    const text = page('"89"')
    const at = text.indexOf('89') + 1 // the 9
    const [row] = stream(text, (index) => index === at)
    expect(row.uncertainFields).toEqual(['amount'])
  })

  it('marks quantities and dates too, and a number written without quotes', () => {
    const text = page('84')
    const digits = (value: string) => text.indexOf(value)
    expect(stream(text, (i) => i === digits('84'))[0].uncertainFields).toEqual(['amount'])
    expect(stream(text, (i) => i === digits('"12"') + 1)[0].uncertainFields).toEqual(['quantity'])
    expect(stream(text, (i) => i === digits('13 March'))[0].uncertainFields).toEqual(['date'])
  })

  it('leaves confident digits alone, and does not judge words or units', () => {
    const text = page('"89"', 'Eggs')
    expect(stream(text, () => false)[0].uncertainFields).toEqual([])
    const wordsOnly = (index: number) => index >= text.indexOf('Eggs') && index < text.indexOf('Eggs') + 4
    expect(stream(text, wordsOnly)[0].uncertainFields).toEqual([])
    const unit = '{"entries": [{"date": "1/2", "item": "Rice", "quantity": "2 kg", "amount": "5"}]}'
    expect(stream(unit, (i) => i === unit.indexOf('kg'))[0].uncertainFields).toEqual([])
  })

  it('keeps the fields the model named itself, in field order', () => {
    const text = '{"entries": [{"date": "1/2", "item": "Rice", "quantity": "2", "amount": "50", "uncertain_fields": ["date"]}]}'
    const [row] = stream(text, (i) => i === text.indexOf('50'))
    expect(row.uncertainFields).toEqual(['date', 'amount'])
  })

  it('only marks the row the doubtful digit is in', () => {
    const text =
      '{"entries": [{"date": "1/2", "item": "Rice", "quantity": "1", "amount": "50"}, {"date": "1/2", "item": "Salt", "quantity": "1", "amount": "36"}]}'
    const rows = stream(text, (i) => i === text.indexOf('36'))
    expect(rows.map((row) => row.uncertainFields)).toEqual([[], ['amount']])
  })

  it('treats text pushed without a probability as certain', () => {
    expect(new EntryStream().push(page('"89"'))[0].uncertainFields).toEqual([])
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
