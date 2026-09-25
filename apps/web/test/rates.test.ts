import { describe, expect, it } from 'vitest';
import type { ElementRecord } from '@shanku/engine';
import { clearOverride, emptyRates, itemKey, parseRate, rateFor, rateItems, setItemRate, setOverride } from '../src/lib/rates';

const el = (gid: string, category: ElementRecord['category'], grade: string, volume: number) =>
  ({ globalId: gid, category, grade, volume } as ElementRecord);

describe('rates: per item with per-element overrides', () => {
  const a = el('A', 'Column', 'RCC_COLUMN', 0.5);
  const b = el('B', 'Column', 'RCC_COLUMN', 0.3);
  const c = el('C', 'Beam', 'RCC_BEAM', 1);

  it('applies an item rate to every element of the item', () => {
    // Without a rate profile, an item nobody priced has no rate (see rateProfiles.test.ts for profiles).
    const book = setItemRate({ ...emptyRates(), profile: undefined }, itemKey(a), 8600);
    expect(rateFor(a, book)).toEqual({ rate: 8600, source: 'item', amount: 4300 });
    expect(rateFor(b, book).amount).toBeCloseTo(2580);
    expect(rateFor(c, book)).toEqual({ rate: null, source: null, amount: null });
    expect(book.edited).toEqual(['Column|RCC_COLUMN']);
  });

  it('lets one element override its item, survives item changes, and resets', () => {
    let book = setItemRate(emptyRates(), itemKey(a), 8600);
    book = setOverride(book, 'B', 9000);
    book = setItemRate(book, itemKey(a), 8800);
    expect(rateFor(a, book).rate).toBe(8800);
    expect(rateFor(b, book)).toEqual({ rate: 9000, source: 'override', amount: 2700 });
    const items = rateItems([a, b, c], book);
    expect(items.find((i) => i.key === 'Column|RCC_COLUMN')).toMatchObject({ count: 2, overrides: 1, amount: 4400 + 2700 });
    book = clearOverride(book, 'B');
    expect(rateFor(b, book).rate).toBe(8800);
  });

  it('parses rates the way people type them', () => {
    expect(parseRate('8,600')).toBe(8600);
    expect(parseRate('₹ 1,23,456.50')).toBe(123456.5);
    expect(parseRate('')).toBeNull();
    expect(parseRate('-5')).toBeNull();
    expect(parseRate('abc')).toBeNull();
  });
});
