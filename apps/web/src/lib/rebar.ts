import type { Category, ElementRecord } from '@shanku/engine';

/**
 * Reinforcement estimate from steel ratios (kg of steel per m³ of concrete), as quantity surveyors
 * estimate before bar bending schedules exist. The typical bands come from the Structura viewer;
 * a ratio outside its band is flagged so a typing slip (1,500 instead of 150) is caught before it
 * reaches a cost.
 */
export const REBAR_BANDS: Partial<Record<Category, readonly [number, number]>> = {
  Column: [120, 250],
  Beam: [90, 200],
  Slab: [60, 120],
  Wall: [70, 160],
};

/** Concrete categories that can carry a steel ratio. */
export const REBAR_CATEGORIES: readonly Category[] = ['Column', 'Beam', 'Slab', 'Wall', 'Footing', 'Pile', 'Stair'];

export interface RebarSettings {
  /** kg of steel per m³ of concrete, per category. */
  ratios: Partial<Record<Category, number>>;
  /** ₹ per kg, or null when not set. */
  rate: number | null;
}

export const emptyRebar = (): RebarSettings => ({ ratios: {}, rate: null });

export type BandStatus = 'ok' | 'low' | 'high' | 'none';

/** Where a ratio sits against the typical band; 'none' when the category has no band or no ratio. */
export function bandStatus(category: Category, ratio: number | undefined | null): BandStatus {
  const band = REBAR_BANDS[category];
  if (!band || ratio === undefined || ratio === null) return 'none';
  return ratio < band[0] ? 'low' : ratio > band[1] ? 'high' : 'ok';
}

export interface RebarRow {
  category: Category;
  /** Concrete volume in scope, m³. */
  volume: number;
  ratio: number | null;
  /** Steel, kg; null without a ratio. */
  kg: number | null;
  amount: number | null;
  band: readonly [number, number] | null;
  status: BandStatus;
}

/** One row per concrete category present, in REBAR_CATEGORIES order, plus totals. */
export function rebarEstimate(elements: readonly ElementRecord[], s: RebarSettings): { rows: RebarRow[]; kg: number; amount: number; missing: number } {
  const volume = new Map<Category, number>();
  for (const e of elements) if (REBAR_CATEGORIES.includes(e.category)) volume.set(e.category, (volume.get(e.category) ?? 0) + e.volume);
  let kg = 0, amount = 0, missing = 0;
  const rows = REBAR_CATEGORIES.filter((c) => volume.has(c)).map((category): RebarRow => {
    const v = volume.get(category)!;
    const ratio = s.ratios[category] ?? null;
    const rowKg = ratio === null ? null : v * ratio;
    const rowAmount = rowKg === null || s.rate === null ? null : rowKg * s.rate;
    if (rowKg === null) missing++;
    kg += rowKg ?? 0;
    amount += rowAmount ?? 0;
    return { category, volume: v, ratio, kg: rowKg, amount: rowAmount, band: REBAR_BANDS[category] ?? null, status: bandStatus(category, ratio) };
  });
  return { rows, kg, amount, missing };
}

/** The warning shown beside a ratio outside its band. */
export function bandWarning(category: Category, ratio: number): string | null {
  const status = bandStatus(category, ratio);
  const band = REBAR_BANDS[category];
  if (!band || status === 'ok' || status === 'none') return null;
  return `${ratio.toLocaleString('en-IN')} kg/m³ is ${status === 'low' ? 'below' : 'above'} the usual ${band[0]}–${band[1]} kg/m³ for ${category.toLowerCase()}s. Check the entry.`;
}
