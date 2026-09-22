import type { ElementRecord } from '@shanku/engine';

/**
 * BOQ rates: one rate per item (category + grade/material), with optional per-element
 * overrides keyed by GlobalId (stable across re-exports). All rates are ₹ per m³ for now.
 */
export interface RateBook {
  /** Item key "Category|Grade" -> rate. */
  items: Record<string, number>;
  /** GlobalId -> rate for this element only. */
  overrides: Record<string, number>;
  /** Item keys the user has changed in this file (for the "edited" styling and count). */
  edited: string[];
}

export const emptyRates = (): RateBook => ({ items: {}, overrides: {}, edited: [] });

export const itemKey = (e: Pick<ElementRecord, 'category' | 'grade'>) => `${e.category}|${e.grade || '(no grade)'}`;

export interface RateResult {
  rate: number | null;
  source: 'item' | 'override' | null;
  amount: number | null;
}

export function rateFor(e: ElementRecord, book: RateBook): RateResult {
  const o = book.overrides[e.globalId];
  if (o !== undefined) return { rate: o, source: 'override', amount: o * e.volume };
  const r = book.items[itemKey(e)];
  return r === undefined ? { rate: null, source: null, amount: null } : { rate: r, source: 'item', amount: r * e.volume };
}

/** Enter: sets the item rate. Existing overrides on other elements stay. */
export function setItemRate(book: RateBook, key: string, rate: number): RateBook {
  return { ...book, items: { ...book.items, [key]: rate }, edited: book.edited.includes(key) ? book.edited : [...book.edited, key] };
}

/** Alt + Enter: sets a rate for one element only. */
export function setOverride(book: RateBook, globalId: string, rate: number): RateBook {
  return { ...book, overrides: { ...book.overrides, [globalId]: rate } };
}

/** "Use item rate": removes an element's override. */
export function clearOverride(book: RateBook, globalId: string): RateBook {
  const overrides = { ...book.overrides };
  delete overrides[globalId];
  return { ...book, overrides };
}

/** Parses "8,600" or "8600.5"; null for anything that is not a finite, non-negative number. */
export function parseRate(text: string): number | null {
  const v = Number(text.replace(/[₹,\s]/g, ''));
  return text.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
}

export interface RateItem {
  key: string;
  category: string;
  grade: string;
  count: number;
  volume: number;
  rate: number | null;
  overrides: number;
  amount: number;
}

/** One row per item for the Summary and Rates views. Amount includes overridden elements. */
export function rateItems(elements: readonly ElementRecord[], book: RateBook): RateItem[] {
  const map = new Map<string, RateItem>();
  for (const e of elements) {
    const key = itemKey(e);
    let it = map.get(key);
    if (!it) map.set(key, (it = { key, category: e.category, grade: e.grade || '(no grade)', count: 0, volume: 0, rate: book.items[key] ?? null, overrides: 0, amount: 0 }));
    it.count++;
    it.volume += e.volume;
    const r = rateFor(e, book);
    if (r.source === 'override') it.overrides++;
    it.amount += r.amount ?? 0;
  }
  return [...map.values()];
}

/** Saved per model file in the browser. */
export function loadRates(fileName: string): RateBook {
  try {
    const v = JSON.parse(window.localStorage.getItem(`shanku.rates.${fileName}`) ?? 'null');
    return v && typeof v === 'object' && v.items && v.overrides ? { edited: [], ...v } : emptyRates();
  } catch {
    return emptyRates();
  }
}

export function saveRates(fileName: string, book: RateBook): void {
  try {
    window.localStorage.setItem(`shanku.rates.${fileName}`, JSON.stringify(book));
  } catch {
    /* storage unavailable: rates apply for this session */
  }
}

export const inr = (v: number, digits = 2) => v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
