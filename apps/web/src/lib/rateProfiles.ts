import type { Category, ElementRecord } from '@shanku/engine';

/**
 * Default BOQ rates by city (rate profiles): pick a city once and every item gets a rate; change a
 * value in the profile once and every item that uses it follows. Item rates typed in the BOQ still
 * win over the profile, and per-element overrides over both.
 *
 * Basis: CPWD Delhi Schedule of Rates (DSR) 2023, prices of April 2023 at Delhi:
 * - RCC concrete excluding formwork and reinforcement: M20 ₹8,364.20/m³, M25 ₹8,683.80/m³ (DSR);
 *   M30 to M40 continue the same step per grade (Shanku's estimate, marked as such in the app).
 * - Centering and shuttering, DSR 5.9: columns ₹961.30/m², beams ₹736.40/m², suspended slabs
 *   ₹927.25/m², walls ₹842.50/m², foundations ₹392.15/m².
 * - Reinforcement, TMT Fe500D, cut, bent, placed and bound: ₹84.50/kg (DSR).
 * City factors are Shanku's indicative estimates of each metro's premium over Delhi, not CPWD cost
 * indices; escalation since April 2023 is a separate factor. Both are editable, and every rate here
 * is a starting point to replace with current tender rates.
 */
export const GRADES = ['M20', 'M25', 'M30', 'M35', 'M40'] as const;
export type Grade = (typeof GRADES)[number];

export interface RateProfileValues {
  /** ₹ per m³ of concrete by grade, excluding formwork and steel (Delhi, DSR 2023). */
  concrete: Record<Grade, number>;
  /** ₹ per m² of formwork by category. */
  formwork: Partial<Record<Category, number>>;
  /** m² of formwork per m³ of concrete, typical for Indian RCC sections (Shanku's estimate). */
  formworkArea: Partial<Record<Category, number>>;
  /** ₹ per kg of reinforcement, fixed in place. */
  steel: number;
  /** kg of steel per m³, the middle of the usual bands. */
  steelRatio: Partial<Record<Category, number>>;
  /** City premium over Delhi (1 = Delhi). */
  cityFactor: number;
  /** Escalation since the base prices (0.1 = +10 %). */
  escalation: number;
  /** Grade assumed when an element's grade does not name one (RCC_BEAM, "Concrete"). */
  defaultGrade: Grade;
}

export const DSR_2023: RateProfileValues = {
  concrete: { M20: 8364.2, M25: 8683.8, M30: 9003.4, M35: 9323.0, M40: 9642.6 },
  formwork: { Column: 961.3, Beam: 736.4, Slab: 927.25, Wall: 842.5, Footing: 392.15, Stair: 927.25, Pile: 0 },
  formworkArea: { Column: 8, Beam: 8, Slab: 6.7, Wall: 8, Footing: 2, Stair: 7, Pile: 0 },
  steel: 84.5,
  steelRatio: { Column: 185, Beam: 145, Slab: 90, Wall: 115, Footing: 80, Pile: 90, Stair: 100 },
  cityFactor: 1,
  escalation: 0,
  defaultGrade: 'M25',
};

/** Grades above M25 are estimates: the DSR items found were M20 and M25. */
export const ESTIMATED_GRADES: readonly Grade[] = ['M30', 'M35', 'M40'];

export interface RateProfile {
  id: string;
  name: string;
  /** Shanku's estimate, or from a published schedule. */
  note: string;
  cityFactor: number;
}

/** Metro city profiles (factor on the Delhi DSR base). Indicative: change them to your own rates. */
export const CITY_PROFILES: readonly RateProfile[] = [
  { id: 'delhi', name: 'Delhi NCR (CPWD DSR 2023 base)', note: 'CPWD DSR 2023 rates as published', cityFactor: 1 },
  { id: 'mumbai', name: 'Mumbai / MMR', note: 'Shanku estimate: +15 % on Delhi', cityFactor: 1.15 },
  { id: 'bengaluru', name: 'Bengaluru', note: 'Shanku estimate: +8 % on Delhi', cityFactor: 1.08 },
  { id: 'pune', name: 'Pune', note: 'Shanku estimate: +8 % on Delhi', cityFactor: 1.08 },
  { id: 'chennai', name: 'Chennai', note: 'Shanku estimate: +5 % on Delhi', cityFactor: 1.05 },
  { id: 'hyderabad', name: 'Hyderabad', note: 'Shanku estimate: +3 % on Delhi', cityFactor: 1.03 },
  { id: 'kolkata', name: 'Kolkata', note: 'Shanku estimate: same as Delhi', cityFactor: 1 },
  { id: 'ahmedabad', name: 'Ahmedabad', note: 'Shanku estimate: −2 % on Delhi', cityFactor: 0.98 },
];

/** The profile a rate book uses: a city and, optionally, its own values. */
export interface ProfileChoice {
  id: string;
  values: RateProfileValues;
}

export function profileFor(id: string): ProfileChoice {
  const city = CITY_PROFILES.find((c) => c.id === id) ?? CITY_PROFILES[0];
  return { id: city.id, values: { ...structuredCloneSafe(DSR_2023), cityFactor: city.cityFactor } };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** The grade a material string names: "M30", "RCC M 30", "C30/37" → M30; null when none. */
export function gradeOf(material: string): Grade | null {
  const m = /\bM\s?-?(\d{2})\b/i.exec(material) ?? /\bC(\d{2})\s*\/\s*\d{2}\b/i.exec(material);
  if (!m) return null;
  const n = +m[1];
  // Nearest grade on the list, so M28 prices as M30 and M45 as M40.
  return GRADES.reduce((best, g) => (Math.abs(+g.slice(1) - n) < Math.abs(+best.slice(1) - n) ? g : best), GRADES[0]);
}

/** Breakdown of one item's profile rate (₹ per m³), for the Rates tab and the Excel note. */
export function profileRate(v: RateProfileValues, category: Category, grade: string): { rate: number; concrete: number; formwork: number; grade: Grade; estimatedGrade: boolean; gradeAssumed: boolean } | null {
  const area = v.formworkArea[category];
  const perM2 = v.formwork[category];
  if (area === undefined || perM2 === undefined) return null; // not a concrete category
  const found = gradeOf(grade);
  const g = found ?? v.defaultGrade;
  const k = v.cityFactor * (1 + v.escalation);
  const concrete = v.concrete[g] * k;
  const formwork = area * perM2 * k;
  return { rate: Math.round(concrete + formwork), concrete, formwork, grade: g, estimatedGrade: ESTIMATED_GRADES.includes(g), gradeAssumed: !found };
}

/** Steel rate and ratios the profile gives (for the reinforcement estimate). */
export function profileSteel(v: RateProfileValues): { rate: number; ratios: Partial<Record<Category, number>> } {
  return { rate: Math.round(v.steel * v.cityFactor * (1 + v.escalation) * 100) / 100, ratios: { ...v.steelRatio } };
}

/** Profile rate for an element's item, or null outside concrete categories. */
export const profileRateFor = (v: RateProfileValues, e: Pick<ElementRecord, 'category' | 'grade'>) => profileRate(v, e.category, e.grade)?.rate ?? null;
