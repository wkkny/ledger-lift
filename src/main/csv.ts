// CSV text for the entries an owner has reviewed.

import type { Entry } from '../shared/types'

const HEADER = ['Date', 'Item or description', 'Quantity', 'Amount']

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
const line = (values: string[]) => values.map(quote).join(',')

/** Every value is quoted, lines end in CRLF, and a byte-order mark lets Excel read accents correctly. */
export function toCsv(entries: Entry[]): string {
  const lines = [line(HEADER), ...entries.map((entry) => line([entry.date, entry.item, entry.quantity, entry.amount]))]
  return `﻿${lines.join('\r\n')}`
}
