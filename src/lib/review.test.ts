import { describe, expect, it } from 'vitest';
import { canDownload, editField, needsAttention, reviewSummary, toRow, unreviewedCount } from './review';
import type { Entry } from './types';

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  date: '5/10',
  item: 'Rice 5kg',
  quantity: '1',
  amount: '1450',
  uncertainFields: [],
  ...overrides,
});

describe('review', () => {
  it('flags a row with a missing value or a value the model was unsure about', () => {
    expect(needsAttention(toRow(entry()))).toBe(false);
    expect(needsAttention(toRow(entry({ amount: '' })))).toBe(true);
    expect(needsAttention(toRow(entry({ uncertainFields: ['item'] })))).toBe(true);
  });

  it('editing a value clears its doubt and requires the row to be reviewed again', () => {
    const row = toRow(entry({ uncertainFields: ['amount', 'item'] }));
    row.reviewed = true;
    editField(row, 'amount', '1500');
    expect(row.amount).toBe('1500');
    expect(row.uncertainFields).toEqual(['item']);
    expect(row.reviewed).toBe(false);
  });

  it('allows the download only when reading has finished and every row is reviewed', () => {
    const rows = [toRow(entry()), toRow(entry())];
    expect(canDownload(rows, false)).toBe(false);
    rows.forEach((row) => (row.reviewed = true));
    expect(canDownload(rows, false)).toBe(true);
    expect(canDownload(rows, true)).toBe(false);
    expect(canDownload([], false)).toBe(false);
  });

  it('counts and describes the rows still to review', () => {
    const rows = [toRow(entry()), toRow(entry()), toRow(entry())];
    rows[0].reviewed = true;
    expect(unreviewedCount(rows)).toBe(2);
    expect(reviewSummary(2, false)).toBe('Review and mark 2 rows before downloading.');
    expect(reviewSummary(1, false)).toBe('Review and mark 1 row before downloading.');
    expect(reviewSummary(0, false)).toMatch(/ready to download/);
    expect(reviewSummary(2, true)).toMatch(/Reading the page/);
  });

  it('gives every row its own id', () => {
    const [a, b] = [toRow(entry()), toRow(entry())];
    expect(a.id).not.toBe(b.id);
  });
});
