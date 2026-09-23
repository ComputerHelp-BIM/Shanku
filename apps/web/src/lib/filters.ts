/**
 * Revit-style view filters: named rule sets limited to categories. Applied to a view with their own
 * graphics; when several match an element, the one higher in the view's list wins.
 */
import type { GraphicsOverride } from './visibility';

export type FilterParam = 'Mark' | 'Level' | 'Type' | 'Name' | 'Grade' | 'IFC class' | 'Volume (m³)' | 'Length (m)';
export type FilterOp = 'equals' | 'does not equal' | 'contains' | 'does not contain' | 'begins with' | 'ends with' | 'greater than' | 'less than';

export const FILTER_PARAMS: FilterParam[] = ['Mark', 'Level', 'Type', 'Name', 'Grade', 'IFC class', 'Volume (m³)', 'Length (m)'];
export const TEXT_OPS: FilterOp[] = ['equals', 'does not equal', 'contains', 'does not contain', 'begins with', 'ends with'];
export const NUMBER_OPS: FilterOp[] = ['equals', 'does not equal', 'greater than', 'less than'];
export const isNumeric = (p: FilterParam) => p === 'Volume (m³)' || p === 'Length (m)';

export interface FilterRule {
  param: FilterParam;
  op: FilterOp;
  value: string;
}

export interface ViewFilter {
  id: string;
  name: string;
  /** Categories it applies to; empty = all. */
  categories: string[];
  /** AND: all rules; OR: any rule. No rules = every element of the categories. */
  combine: 'and' | 'or';
  rules: FilterRule[];
}

/** A filter applied to the view, with its graphics (Revit's VG → Filters tab row). */
export interface AppliedFilter {
  filterId: string;
  enabled: boolean;
  override: GraphicsOverride;
}

export interface FilterableElement {
  index: number;
  category: string;
  mark: string;
  level: string;
  typeName: string;
  name: string;
  grade: string;
  ifcClass: string;
  volume: number;
  dims?: { length?: number | null };
}

function field(e: FilterableElement, p: FilterParam): string | number {
  switch (p) {
    case 'Mark':
      return e.mark;
    case 'Level':
      return e.level;
    case 'Type':
      return e.typeName;
    case 'Name':
      return e.name;
    case 'Grade':
      return e.grade;
    case 'IFC class':
      return e.ifcClass;
    case 'Volume (m³)':
      return e.volume;
    case 'Length (m)':
      return e.dims?.length ?? 0;
  }
}

/** Does one rule hold? Text compares ignore case, as Revit does. */
export function ruleMatches(e: FilterableElement, r: FilterRule): boolean {
  const v = field(e, r.param);
  if (typeof v === 'number') {
    const n = Number(r.value);
    if (!Number.isFinite(n)) return false;
    const eps = 1e-6 * Math.max(1, Math.abs(n));
    switch (r.op) {
      case 'equals':
        return Math.abs(v - n) <= eps;
      case 'does not equal':
        return Math.abs(v - n) > eps;
      case 'greater than':
        return v > n + eps;
      case 'less than':
        return v < n - eps;
      default:
        return false;
    }
  }
  const a = v.toLowerCase(), b = r.value.trim().toLowerCase();
  switch (r.op) {
    case 'equals':
      return a === b;
    case 'does not equal':
      return a !== b;
    case 'contains':
      return a.includes(b);
    case 'does not contain':
      return !a.includes(b);
    case 'begins with':
      return a.startsWith(b);
    case 'ends with':
      return a.endsWith(b);
    default:
      return false;
  }
}

export function filterMatches(e: FilterableElement, f: ViewFilter): boolean {
  if (f.categories.length && !f.categories.includes(e.category)) return false;
  if (!f.rules.length) return true;
  return f.combine === 'and' ? f.rules.every((r) => ruleMatches(e, r)) : f.rules.some((r) => ruleMatches(e, r));
}

/** The first enabled applied filter (in view order) that matches, or null. */
export function winningFilter(e: FilterableElement, applied: AppliedFilter[], defs: Map<string, ViewFilter>): AppliedFilter | null {
  for (const a of applied) {
    if (!a.enabled) continue;
    const f = defs.get(a.filterId);
    if (f && filterMatches(e, f)) return a;
  }
  return null;
}

export function newFilterId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
