/**
 * Visibility/Graphics for the 3D view, as in Revit: per model category (visible, surface colour,
 * transparency, halftone) plus per-element overrides ("Override Graphics in View > By Element"),
 * where the element's own setting wins over its category's.
 */
import { winningFilter, type AppliedFilter, type FilterableElement, type ViewFilter } from './filters';

export interface GraphicsOverride {
  /** false hides it in this view (not temporary: HR does not bring it back). */
  visible?: boolean;
  /** Surface colour, "#RRGGBB"; null or absent = no colour override. */
  color?: string | null;
  /** 0-100 %. */
  transparency?: number;
  halftone?: boolean;
}

export type CategoryOverrides = Record<string, GraphicsOverride>;
export type ElementOverrides = Record<number, GraphicsOverride>;

export interface ViewGraphics {
  categories: CategoryOverrides;
  elements: ElementOverrides;
  /** Filter definitions (project-wide in Revit; kept with the view here). */
  filters: ViewFilter[];
  /** Filters applied to this view, highest priority first. */
  applied: AppliedFilter[];
}

export const EMPTY_GRAPHICS: ViewGraphics = { categories: {}, elements: {}, filters: [], applied: [] };

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function isEmptyOverride(o: GraphicsOverride | undefined): boolean {
  return !o || ((o.visible ?? true) && !o.color && !o.transparency && !o.halftone);
}

/**
 * Effective result per element: which are hidden by the view, and the override list for the viewer.
 * Precedence, as in Revit: element override > first matching view filter > category.
 */
export function resolveGraphics(
  elements: ReadonlyArray<{ index: number; category: string } & Partial<FilterableElement>>,
  g: ViewGraphics,
): { hidden: number[]; overrides: Array<{ index: number; color: [number, number, number] | null; transparency: number; halftone: boolean }> } {
  const hidden: number[] = [];
  const overrides: Array<{ index: number; color: [number, number, number] | null; transparency: number; halftone: boolean }> = [];
  const defs = new Map((g.filters ?? []).map((f) => [f.id, f]));
  const applied = (g.applied ?? []).filter((a) => a.enabled && defs.has(a.filterId));
  for (const e of elements) {
    const c = g.categories[e.category];
    const el = g.elements[e.index];
    const fl = applied.length ? winningFilter(e as FilterableElement, applied, defs)?.override : undefined;
    if (!c && !el && !fl) continue;
    const pick = <K extends keyof GraphicsOverride>(k: K): GraphicsOverride[K] | undefined =>
      el?.[k] !== undefined ? el[k] : fl?.[k] !== undefined ? fl[k] : c?.[k];
    if (!(pick('visible') ?? true)) {
      hidden.push(e.index);
      continue;
    }
    const color = pick('color') ?? null;
    const transparency = pick('transparency') ?? 0;
    const halftone = pick('halftone') ?? false;
    const rgb = color ? hexToRgb(color) : null;
    if (rgb || transparency > 0 || halftone) overrides.push({ index: e.index, color: rgb, transparency, halftone });
  }
  return { hidden, overrides };
}

/** Number of categories and elements that carry any override (for the ribbon badge / status). */
export function countOverrides(g: ViewGraphics): number {
  return (
    Object.values(g.categories).filter((o) => !isEmptyOverride(o)).length +
    Object.values(g.elements).filter((o) => !isEmptyOverride(o)).length +
    (g.applied ?? []).filter((a) => a.enabled).length
  );
}
