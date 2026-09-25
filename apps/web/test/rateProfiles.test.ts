import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ElementRecord } from '@shanku/engine';
import { DSR_2023, gradeOf, profileFor, profileRate, profileSteel } from '../src/lib/rateProfiles';
import { effectiveRebar, emptyRates, rateFor, rateItems, setItemRate, setOverride } from '../src/lib/rates';

beforeEach(() => {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const el = (category: string, grade: string, volume = 1, globalId = 'G'): ElementRecord => ({ category, grade, volume, globalId }) as unknown as ElementRecord;

describe('rate profiles', () => {
  it('reads grades from material names', () => {
    expect(gradeOf('M30')).toBe('M30');
    expect(gradeOf('RCC M 25 concrete')).toBe('M25');
    expect(gradeOf('C30/37')).toBe('M30');
    expect(gradeOf('M28')).toBe('M30');
    expect(gradeOf('M60')).toBe('M40');
    expect(gradeOf('RCC_BEAM')).toBeNull();
  });

  it('prices an item as DSR concrete plus formwork, times city and escalation', () => {
    const delhi = profileRate(DSR_2023, 'Column', 'M25')!;
    expect(delhi.concrete).toBeCloseTo(8683.8);
    expect(delhi.formwork).toBeCloseTo(8 * 961.3);
    expect(delhi.rate).toBe(Math.round(8683.8 + 8 * 961.3));
    const mumbai = profileRate(profileFor('mumbai').values, 'Column', 'M25')!;
    expect(mumbai.rate).toBe(Math.round((8683.8 + 8 * 961.3) * 1.15));
    const up = profileRate({ ...DSR_2023, escalation: 0.1 }, 'Slab', 'M20')!;
    expect(up.rate).toBe(Math.round((8364.2 + 6.7 * 927.25) * 1.1));
    expect(profileRate(DSR_2023, 'Beam', 'RCC_BEAM')).toMatchObject({ grade: 'M25', gradeAssumed: true });
    expect(profileRate(DSR_2023, 'Other', 'M25')).toBeNull();
    expect(profileRate(DSR_2023, 'Column', 'M35')?.estimatedGrade).toBe(true);
  });

  it('gives steel defaults that follow the city', () => {
    expect(profileSteel(profileFor('mumbai').values).rate).toBe(97.18); // 84.50 × 1.15, to the paisa
    expect(profileSteel(DSR_2023).ratios.Column).toBe(185);
  });
});

describe('rate precedence', () => {
  it('element override, then typed item rate, then the profile', () => {
    let book = emptyRates();
    expect(book.profile?.id).toBe('delhi'); // the default on a new device
    const col = el('Column', 'M25', 2, 'A');
    expect(rateFor(col, book)).toMatchObject({ source: 'profile', rate: Math.round(8683.8 + 8 * 961.3) });
    book = setItemRate(book, 'Column|M25', 15000);
    expect(rateFor(col, book)).toEqual({ rate: 15000, source: 'item', amount: 30000 });
    book = setOverride(book, 'A', 9000);
    expect(rateFor(col, book).source).toBe('override');
    expect(rateItems([col, el('Beam', 'M30', 1, 'B')], book).find((i) => i.category === 'Beam')?.rate).toBe(Math.round(9003.4 + 8 * 736.4));
  });

  it('typed steel values sit on top of the profile; clearing one falls back', () => {
    const book = { ...emptyRates(), rebar: { ratios: { Column: 220 }, rate: null } };
    const s = effectiveRebar(book);
    expect(s.ratios.Column).toBe(220);
    expect(s.ratios.Beam).toBe(145);
    expect(s.rate).toBe(84.5);
  });
});
