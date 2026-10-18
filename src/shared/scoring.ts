// Scoring what the model read against the rows a person typed in by hand.

export const FIELDS = ['date', 'item', 'quantity', 'amount'] as const
export type Field = (typeof FIELDS)[number]

export type AnswerRow = Record<Field, string>
/** A row as the app shows it, with the fields it highlighted for review. */
export type ReadRow = AnswerRow & { uncertain: Field[] }

/** Reads an answer file: header `date,item,quantity,amount`, then one row per sale. Quoted fields may hold commas. */
export function parseAnswerCsv(text: string): AnswerRow[] {
  const records: string[][] = []
  let record: string[] = []
  let value = ''
  let quoted = false
  const source = text.replace(/^﻿/, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"'
        i++
      } else if (char === '"') quoted = false
      else value += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      record.push(value)
      value = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++
      record.push(value)
      value = ''
      if (record.some((cell) => cell.trim() !== '')) records.push(record)
      record = []
    } else value += char
  }
  record.push(value)
  if (record.some((cell) => cell.trim() !== '')) records.push(record)

  const [header = [], ...rows] = records
  if (header.map((cell) => cell.trim().toLowerCase()).join(',') !== FIELDS.join(',')) {
    throw new Error(`The answer file must start with the header ${FIELDS.join(',')}.`)
  }
  return rows.map((cells, index) => {
    if (cells.length !== FIELDS.length) throw new Error(`Answer row ${index + 1} has ${cells.length} columns, expected ${FIELDS.length}.`)
    return { date: cells[0], item: cells[1], quantity: cells[2], amount: cells[3] }
  })
}

/** Forgives differences that do not change what was sold: case, spacing (including `250 g` vs `250g`), currency symbols, `5.00` vs `5`. */
export function lenient(field: Field, value: string): string {
  const text = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (field !== 'quantity' && field !== 'amount') return text
  const unitsJoined = field === 'quantity' ? text.replace(/(\d) (?=[a-z])/g, '$1') : text // `250 g` = `250g`
  return unitsJoined.replace(/[$₹£€]/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/(\d)\.0+$/, '$1').trim()
}

const sameField = (field: Field, a: string, b: string) => lenient(field, a) === lenient(field, b)

function similarity(expected: AnswerRow, read: AnswerRow): number {
  return FIELDS.filter((field) => sameField(field, expected[field], read[field])).length / FIELDS.length
}

/**
 * Pairs each answer row with the row the model read for it, keeping page order, so that one missed or
 * invented row does not make every row after it count as wrong. Returns, per answer row, the index of
 * the row read for it, or null if it was missed.
 */
export function align(expected: AnswerRow[], read: AnswerRow[]): (number | null)[] {
  const n = expected.length
  const m = read.length
  const best = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  const sim = expected.map((row) => read.map((other) => similarity(row, other)))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const paired = sim[i][j] > 0 ? sim[i][j] + best[i + 1][j + 1] : -1
      best[i][j] = Math.max(paired, best[i + 1][j], best[i][j + 1])
    }
  }
  const pairs: (number | null)[] = new Array(n).fill(null)
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const paired = sim[i][j] > 0 ? sim[i][j] + best[i + 1][j + 1] : -1
    if (paired === best[i][j]) pairs[i++] = j++
    else if (best[i + 1][j] === best[i][j]) i++
    else j++
  }
  return pairs
}

export type FieldScore = { total: number; exact: number; lenient: number }

export type Score = {
  expectedRows: number
  readRows: number
  /** Answer rows the model produced nothing like. */
  missedRows: number
  /** Rows the model produced that match no answer row. */
  extraRows: number
  /** Answer rows with all four fields exactly right, and with all four right after forgiving formatting. */
  exactRows: number
  lenientRows: number
  fields: Record<Field, FieldScore>
  /** Wrong fields (formatting forgiven) in rows the model did produce, and how many of those it highlighted. */
  wrongFields: number
  wrongFieldsHighlighted: number
  /** Correct fields it highlighted anyway: needless review work. */
  correctFieldsHighlighted: number
}

export function score(expected: AnswerRow[], read: ReadRow[]): Score {
  const pairs = align(expected, read)
  const fields = Object.fromEntries(FIELDS.map((field) => [field, { total: expected.length, exact: 0, lenient: 0 }])) as Record<Field, FieldScore>
  let exactRows = 0
  let lenientRows = 0
  let wrongFields = 0
  let wrongFieldsHighlighted = 0
  let correctFieldsHighlighted = 0
  expected.forEach((answer, index) => {
    const matched = pairs[index]
    if (matched === null) return
    const row = read[matched]
    let allExact = true
    let allLenient = true
    for (const field of FIELDS) {
      const exact = row[field] === answer[field]
      const close = sameField(field, row[field], answer[field])
      if (exact) fields[field].exact++
      else allExact = false
      if (close) fields[field].lenient++
      else allLenient = false
      const highlighted = row.uncertain.includes(field)
      if (!close) {
        wrongFields++
        if (highlighted) wrongFieldsHighlighted++
      } else if (highlighted) correctFieldsHighlighted++
    }
    if (allExact) exactRows++
    if (allLenient) lenientRows++
  })
  const matchedCount = pairs.filter((pair) => pair !== null).length
  return {
    expectedRows: expected.length,
    readRows: read.length,
    missedRows: expected.length - matchedCount,
    extraRows: read.length - matchedCount,
    exactRows,
    lenientRows,
    fields,
    wrongFields,
    wrongFieldsHighlighted,
    correctFieldsHighlighted
  }
}

/** Adds up several pages' scores. */
export function combine(scores: Score[]): Score {
  const total: Score = {
    expectedRows: 0, readRows: 0, missedRows: 0, extraRows: 0, exactRows: 0, lenientRows: 0,
    fields: Object.fromEntries(FIELDS.map((field) => [field, { total: 0, exact: 0, lenient: 0 }])) as Record<Field, FieldScore>,
    wrongFields: 0, wrongFieldsHighlighted: 0, correctFieldsHighlighted: 0
  }
  for (const each of scores) {
    for (const key of ['expectedRows', 'readRows', 'missedRows', 'extraRows', 'exactRows', 'lenientRows', 'wrongFields', 'wrongFieldsHighlighted', 'correctFieldsHighlighted'] as const) total[key] += each[key]
    for (const field of FIELDS) {
      total.fields[field].total += each.fields[field].total
      total.fields[field].exact += each.fields[field].exact
      total.fields[field].lenient += each.fields[field].lenient
    }
  }
  return total
}

const percent = (part: number, whole: number) => (whole === 0 ? '–' : `${Math.round((part / whole) * 100)}%`)

/** A short human-readable summary of one score. */
export function describe(result: Score): string {
  const lines = [
    `rows: ${result.expectedRows} expected, ${result.readRows} read (${result.missedRows} missed, ${result.extraRows} extra)`,
    `rows fully right: ${result.lenientRows}/${result.expectedRows} (${percent(result.lenientRows, result.expectedRows)}); letter-for-letter ${result.exactRows}/${result.expectedRows}`,
    ...FIELDS.map((field) => {
      const each = result.fields[field]
      return `  ${field.padEnd(8)} ${percent(each.lenient, each.total).padStart(4)} right (${percent(each.exact, each.total)} letter-for-letter)`
    }),
    `wrong fields it highlighted for review: ${result.wrongFieldsHighlighted}/${result.wrongFields}; correct fields highlighted anyway: ${result.correctFieldsHighlighted}`
  ]
  return lines.join('\n')
}
