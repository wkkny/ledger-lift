import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'
import type { Entry } from '../shared/types'

const entry = (item: string): Entry => ({ date: '5/10', item, quantity: '2', amount: '100', uncertainFields: [] })

describe('toCsv', () => {
  it('writes a header and one line per entry', () => {
    const lines = toCsv([entry('Rice'), entry('Salt')]).replace(/^﻿/, '').split('\r\n')
    expect(lines[0]).toBe('"Date","Item or description","Quantity","Amount"')
    expect(lines[1]).toBe('"5/10","Rice","2","100"')
    expect(lines).toHaveLength(3)
  })

  it('starts with a byte-order mark', () => {
    expect(toCsv([]).startsWith('﻿')).toBe(true)
  })

  it('quotes commas and doubles embedded quotes', () => {
    expect(toCsv([entry('Oil, "extra" virgin')])).toContain('"Oil, ""extra"" virgin"')
  })

  it('keeps a line break inside a value quoted', () => {
    expect(toCsv([entry('Rice\nbag')])).toContain('"Rice\nbag"')
  })
})
