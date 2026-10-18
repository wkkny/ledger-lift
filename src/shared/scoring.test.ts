import { describe, expect, it } from 'vitest'
import { align, combine, lenient, parseAnswerCsv, score, type AnswerRow, type ReadRow } from './scoring'

const row = (date: string, item: string, quantity: string, amount: string): AnswerRow => ({ date, item, quantity, amount })
const read = (answer: AnswerRow, uncertain: ReadRow['uncertain'] = []): ReadRow => ({ ...answer, uncertain })

const answers = [row('1/2', 'Rice', '2', '100'), row('1/2', 'Sugar', '1', '45'), row('1/3', 'Tea', '3', '150'), row('1/3', 'Oil', '1', '120')]

describe('parseAnswerCsv', () => {
  it('reads quoted commas, empty fields, a BOM, and Windows line endings', () => {
    const text = '﻿date,item,quantity,amount\r\n1/2,"Rice, basmati",2,100\r\n1/3,Tea,,\r\n\r\n'
    expect(parseAnswerCsv(text)).toEqual([row('1/2', 'Rice, basmati', '2', '100'), row('1/3', 'Tea', '', '')])
  })

  it('rejects a wrong header and a ragged row', () => {
    expect(() => parseAnswerCsv('day,item,qty,amount\n1,2,3,4')).toThrow(/header/)
    expect(() => parseAnswerCsv('date,item,quantity,amount\n1,2,3')).toThrow(/Answer row 1/)
  })
})

describe('lenient', () => {
  it('forgives case, spacing and currency formatting only where it is harmless', () => {
    expect(lenient('item', '  Rice   Bag ')).toBe('rice bag')
    expect(lenient('amount', '₹1,200.00')).toBe('1200')
    expect(lenient('amount', '$45')).toBe('45')
    expect(lenient('quantity', '250 g')).toBe(lenient('quantity', '250g'))
    expect(lenient('quantity', '2 kg')).not.toBe(lenient('quantity', '2 g'))
    expect(lenient('item', 'Rice 5 kg')).toBe('rice 5 kg') // only quantities join number and unit
    expect(lenient('date', '1/2')).not.toBe(lenient('date', '01/02'))
  })
})

describe('align', () => {
  it('pairs rows in order when nothing is missing', () => {
    expect(align(answers, answers)).toEqual([0, 1, 2, 3])
  })

  it('does not shift later rows when the model skips one', () => {
    expect(align(answers, [answers[0], answers[2], answers[3]])).toEqual([0, null, 1, 2])
  })

  it('ignores a row the model invented', () => {
    expect(align(answers, [answers[0], row('9/9', 'Ghost', '7', '7'), answers[1], answers[2], answers[3]])).toEqual([0, 2, 3, 4])
  })
})

describe('score', () => {
  it('is perfect for a perfect read', () => {
    const result = score(answers, answers.map((each) => read(each)))
    expect(result).toMatchObject({ missedRows: 0, extraRows: 0, exactRows: 4, lenientRows: 4, wrongFields: 0 })
    expect(result.fields.amount).toEqual({ total: 4, exact: 4, lenient: 4 })
  })

  it('counts a skipped row as missed and keeps the others right', () => {
    const result = score(answers, [read(answers[0]), read(answers[2]), read(answers[3])])
    expect(result).toMatchObject({ expectedRows: 4, readRows: 3, missedRows: 1, extraRows: 0, lenientRows: 3 })
    expect(result.fields.item.lenient).toBe(3)
  })

  it('separates formatting differences from real mistakes', () => {
    const result = score(answers, [read(row('1/2', 'rice', '2', '100.00')), read(row('1/2', 'Sugar', '1', '54')), read(answers[2]), read(answers[3])])
    expect(result.lenientRows).toBe(3)
    expect(result.exactRows).toBe(2)
    expect(result.fields.amount).toEqual({ total: 4, exact: 2, lenient: 3 })
    expect(result.wrongFields).toBe(1)
  })

  it('tracks whether the mistakes were highlighted for review', () => {
    const result = score(answers, [
      read(answers[0], ['item']),
      read(row('1/2', 'Sugar', '1', '54'), ['amount']),
      read(row('1/3', 'Tea', '8', '150')),
      read(answers[3])
    ])
    expect(result).toMatchObject({ wrongFields: 2, wrongFieldsHighlighted: 1, correctFieldsHighlighted: 1 })
  })
})

describe('combine', () => {
  it('adds pages together', () => {
    const one = score(answers, answers.map((each) => read(each)))
    const total = combine([one, one])
    expect(total.expectedRows).toBe(8)
    expect(total.fields.date).toEqual({ total: 8, exact: 8, lenient: 8 })
  })
})
