import type { ElementRecord } from '@shanku/engine';
import type { RebarSettings } from './rebar';
import { profileFor, profileRateFor, profileSteel, type ProfileChoice } from './rateProfiles';

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
  /** Reinforcement estimate: steel ratios per category and a steel rate (optional; older books have none). */
  rebar?: RebarSettings;
  /** City rate profile: the rate of every item nobody typed a rate for (and the steel defaults). */
  profile?: ProfileChoice;
}

const PROFILE_KEY = 'shanku.rateProfile';

/** The profile new rate books start with: the one used last on this device, else Delhi (DSR 2023). */
export function lastProfile(): ProfileChoice {
  try {
    const v = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
    if (v && typeof v.id === 'string' && v.values && typeof v.values.steel === 'number') return v as ProfileChoice;
  } catch {
    /* unreadable: the default */
  }
  return profileFor('delhi');
}
export function rememberProfile(p: ProfileChoice): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export const emptyRates = (): RateBook => ({ items: {}, overrides: {}, edited: [], profile: lastProfile() });

export const itemKey = (e: Pick<ElementRecord, 'category' | 'grade'>) => `${e.category}|${e.grade || '(no grade)'}`;

export interface RateResult {
  rate: number | null;
  /** override: this element only · item: typed for the item · profile: the city profile's rate. */
  source: 'item' | 'override' | 'profile' | null;
  amount: number | null;
}

/** An item's rate: typed for the item, else the profile's; null when neither gives one. */
export function itemRate(book: RateBook, e: Pick<ElementRecord, 'category' | 'grade'>): { rate: number | null; source: 'item' | 'profile' | null } {
  const typed = book.items[itemKey(e)];
  if (typed !== undefined) return { rate: typed, source: 'item' };
  const p = book.profile ? profileRateFor(book.profile.values, e) : null;
  return p === null ? { rate: null, source: null } : { rate: p, source: 'profile' };
}

export function rateFor(e: ElementRecord, book: RateBook): RateResult {
  const o = book.overrides[e.globalId];
  if (o !== undefined) return { rate: o, source: 'override', amount: o * e.volume };
  const r = itemRate(book, e);
  return r.rate === null ? { rate: null, source: null, amount: null } : { rate: r.rate, source: r.source, amount: r.rate * e.volume };
}

/** Steel ratios and rate: typed ones first, then the profile's (a blank ratio falls back to it). */
export function effectiveRebar(book: RateBook): RebarSettings {
  const p = book.profile ? profileSteel(book.profile.values) : { rate: null, ratios: {} };
  return { ratios: { ...p.ratios, ...(book.rebar?.ratios ?? {}) }, rate: book.rebar?.rate ?? p.rate };
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
    if (!it) map.set(key, (it = { key, category: e.category, grade: e.grade || '(no grade)', count: 0, volume: 0, rate: itemRate(book, e).rate, overrides: 0, amount: 0 }));
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
    if (!(v && typeof v === 'object' && v.items && v.overrides)) return emptyRates();
    const book: RateBook = { edited: [], ...v };
    if (!book.profile || typeof book.profile.values?.steel !== 'number') book.profile = lastProfile(); // older books: the current default
    // Drop a malformed reinforcement block rather than the whole rate book.
    const rb = book.rebar as unknown as { ratios?: unknown; rate?: unknown } | undefined;
    if (rb && (typeof rb.ratios !== 'object' || rb.ratios === null || !(rb.rate === null || typeof rb.rate === 'number'))) delete book.rebar;
    return book;
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
