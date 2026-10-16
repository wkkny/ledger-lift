import type { Entry } from './types';

export const FIELDS = [
  { key: 'date', label: 'Date' },
  { key: 'item', label: 'Item or description' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'amount', label: 'Amount' },
] as const;

export type FieldKey = (typeof FIELDS)[number]['key'];

/** An entry on screen: the model's reading plus whether the owner has checked it. */
export type Row = Entry & { id: number; reviewed: boolean };

let nextId = 1;

export function toRow(entry: Entry): Row {
  return { ...entry, id: nextId++, reviewed: false };
}

export function isUncertain(row: Row, key: FieldKey): boolean {
  return !row[key] || row.uncertainFields.includes(key);
}

export function needsAttention(row: Row): boolean {
  return FIELDS.some(({ key }) => isUncertain(row, key));
}

/** Editing a value means the owner must look at the row again before export. */
export function editField(row: Row, key: FieldKey, value: string): void {
  row[key] = value;
  row.uncertainFields = row.uncertainFields.filter((field) => field !== key);
  row.reviewed = false;
}

export function unreviewedCount(rows: Row[]): number {
  return rows.filter((row) => !row.reviewed).length;
}

export function reviewSummary(remaining: number, reading: boolean): string {
  if (reading) return 'Reading the page. Rows appear as they are found.';
  if (remaining === 0) return 'Every row is marked reviewed and ready to download.';
  return `Review and mark ${remaining} ${remaining === 1 ? 'row' : 'rows'} before downloading.`;
}

export function canDownload(rows: Row[], reading: boolean): boolean {
  return !reading && rows.length > 0 && unreviewedCount(rows) === 0;
}

export function toCsvEntries(rows: Row[]): Entry[] {
  return rows.map(({ date, item, quantity, amount }) => ({ date, item, quantity, amount, uncertainFields: [] }));
}
