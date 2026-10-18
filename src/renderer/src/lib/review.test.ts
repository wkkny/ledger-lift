import { describe, expect, it } from 'vitest';
import { canDownload, editField, markAllReviewed, needsAttention, reviewSummary, toRow, unreviewedCount } from './review';
import type { Entry } from '@shared/types';

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
    const row = { ...toRow(entry({ uncertainFields: ['amount', 'item'] })), reviewed: true };
    const edited = editField(row, 'amount', '1500');
    expect(edited.amount).toBe('1500');
    expect(edited.uncertainFields).toEqual(['item']);
    expect(edited.reviewed).toBe(false);
    expect(row.amount).toBe('1450'); // the original row is untouched
  });

  it('allows the download only when reading has finished and every row is reviewed', () => {
    const rows = [toRow(entry()), toRow(entry())];
    expect(canDownload(rows, false)).toBe(false);
    const reviewed = rows.map((row) => ({ ...row, reviewed: true }));
    expect(canDownload(reviewed, false)).toBe(true);
    expect(canDownload(reviewed, true)).toBe(false);
    expect(canDownload([], false)).toBe(false);
  });

  it('counts and describes the rows still to review', () => {
    const rows = [toRow(entry()), toRow(entry()), toRow(entry())];
    rows[0] = { ...rows[0], reviewed: true };
    expect(unreviewedCount(rows)).toBe(2);
    expect(reviewSummary(2, false)).toBe('Review and mark 2 rows before downloading.');
    expect(reviewSummary(1, false)).toBe('Review and mark 1 row before downloading.');
    expect(reviewSummary(0, false)).toMatch(/ready to download/);
    expect(reviewSummary(2, true)).toMatch(/Reading the page/);
  });

  it('marks every row reviewed in one go, and an edit afterwards unmarks only that row', () => {
    const rows = [toRow(entry()), { ...toRow(entry({ amount: '' })), reviewed: true }, toRow(entry())];
    const all = markAllReviewed(rows);
    expect(unreviewedCount(all)).toBe(0);
    expect(all[1]).toBe(rows[1]); // rows already reviewed are left as they were
    expect(rows[0].reviewed).toBe(false); // the original rows are untouched
    const edited = editField(all[2], 'amount', '20');
    expect(unreviewedCount([all[0], all[1], edited])).toBe(1);
  });

  it('gives every row its own id', () => {
    const [a, b] = [toRow(entry()), toRow(entry())];
    expect(a.id).not.toBe(b.id);
  });
});
