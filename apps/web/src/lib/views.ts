/**
 * Views of the model, as in Revit's Project Browser: 3D views, a structural plan per level, the four
 * building elevations and user sections. Each view keeps its own graphics, visual style, edges and
 * temporary hides; plans and sections also carry a view range (a clip box without grips).
 */
import type { DisplayStyle } from '@shanku/engine';
import { EMPTY_GRAPHICS, type ViewGraphics } from './visibility';

export type ViewKind = '3d' | 'plan' | 'elevation' | 'section';

export interface ModelView {
  id: string;
  kind: ViewKind;
  name: string;
  /** Plan: its level. */
  level?: string;
  /** Plan: cut plane above the level and view depth below it, in metres (Revit's View Range). */
  cutOffset?: number;
  viewDepth?: number;
  /** Elevation: direction from the model toward the viewer (world, Y up). */
  direction?: [number, number, number];
  /** Section: line in plan (world x, z) and far-clip depth in metres. */
  section?: { a: [number, number]; b: [number, number]; depth: number };
  graphics: ViewGraphics;
  displayStyle: DisplayStyle;
  edges: boolean;
}

export const DEFAULT_CUT = 1.2;
export const DEFAULT_DEPTH = 1.2;
/** Slab transparency in new structural plans, %. */
export const PLAN_SLAB_TRANSPARENCY = 70;

export const KIND_LABEL: Record<ViewKind, string> = {
  '3d': '3D View',
  plan: 'Structural Plan',
  elevation: 'Elevation',
  section: 'Section',
};

const fresh = (): Pick<ModelView, 'graphics' | 'displayStyle' | 'edges'> => ({ graphics: structuredClone(EMPTY_GRAPHICS), displayStyle: 'shaded', edges: true });

export const isTwoD = (v: ModelView | undefined): boolean => !!v && v.kind !== '3d';

interface ElementLike {
  category: string;
  level: string;
  bounds: ArrayLike<number>; // x0, y0, z0, x1, y1, z1 (world metres, Y up)
}

const UNIT_TO_M: Record<string, number> = { mm: 0.001, millimetre: 0.001, cm: 0.01, m: 1, metre: 1, ft: 0.3048, foot: 0.3048, in: 0.0254, inch: 0.0254 };

/**
 * Level heights in world metres. The storey elevation from the file is used when the geometry agrees
 * with it (some element on the level starts or ends there); otherwise the height is read from the
 * geometry: slab tops (Revit levels sit at the top of the structural slab), then beam tops, then the
 * base of columns and walls, then the level's lowest point. Files differ in which storey they put
 * columns on, so columns come late.
 */
export function levelHeights(
  levels: ReadonlyArray<{ name: string; elevation?: number | null }>,
  elements: ReadonlyArray<ElementLike>,
  lengthUnit?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  const scale = UNIT_TO_M[(lengthUnit ?? '').toLowerCase()] ?? null;
  const mode = (vals: number[]) => {
    const count = new Map<number, number>();
    for (const v of vals) {
      const k = Math.round(v * 100) / 100;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
  };
  for (const l of levels) {
    const on = elements.filter((e) => e.level === l.name);
    if (l.elevation !== null && l.elevation !== undefined && scale !== null) {
      const z = l.elevation * scale;
      if (on.some((e) => Math.abs(e.bounds[1] - z) < 0.05 || Math.abs(e.bounds[4] - z) < 0.05)) {
        out.set(l.name, z);
        continue;
      }
    }
    const tops = (cat: string) => on.filter((e) => e.category === cat).map((e) => e.bounds[4]);
    const bases = on.filter((e) => e.category === 'Column' || e.category === 'Wall').map((e) => e.bounds[1]);
    const slabs = tops('Slab'), beams = tops('Beam');
    const h = slabs.length ? mode(slabs) : beams.length ? mode(beams) : bases.length ? mode(bases) : on.length ? Math.min(...on.map((e) => e.bounds[1])) : undefined;
    if (h !== undefined) out.set(l.name, h);
  }
  return out;
}

/** Revit's views for a new model: {3D}, a structural plan per level, and the four elevations. */
export function defaultViews(levels: ReadonlyArray<{ name: string }>, heights: Map<string, number>): ModelView[] {
  const views: ModelView[] = [{ id: '3d', kind: '3d', name: '{3D}', ...fresh() }];
  for (const l of levels) {
    if (!heights.has(l.name)) continue;
    // Structural plans see through the floor slab (like Revit's structural plan template), so the
    // beams and columns under it still read; change it in Visibility/Graphics like any override.
    const plan = { id: `plan:${l.name}`, kind: 'plan' as const, name: l.name, level: l.name, cutOffset: DEFAULT_CUT, viewDepth: DEFAULT_DEPTH, ...fresh() };
    plan.graphics.categories = { Slab: { transparency: PLAN_SLAB_TRANSPARENCY } };
    views.push(plan);
  }
  const elevations: Array<[string, [number, number, number]]> = [
    ['North', [0, 0, -1]],
    ['East', [1, 0, 0]],
    ['South', [0, 0, 1]],
    ['West', [-1, 0, 0]],
  ];
  for (const [n, d] of elevations) views.push({ id: `elev:${n}`, kind: 'elevation', name: n, direction: d, ...fresh() });
  return views;
}

/** Box as the viewer's section box: centre, half sizes, plan angle. */
export interface ClipBox {
  center: [number, number, number];
  half: [number, number, number];
  angle: number;
}

/**
 * The view range as a clip box: plans keep what lies between (level − depth) and (level + cut);
 * sections keep the slice from the section line to the far clip. Null for 3D views and elevations.
 */
export function viewClip(v: ModelView, heights: Map<string, number>, model: { min: [number, number, number]; max: [number, number, number] }): ClipBox | null {
  const pad = 1;
  if (v.kind === 'plan' && v.level !== undefined && heights.has(v.level)) {
    const h = heights.get(v.level)!;
    const lo = h - (v.viewDepth ?? DEFAULT_DEPTH), hi = h + (v.cutOffset ?? DEFAULT_CUT);
    return {
      center: [(model.min[0] + model.max[0]) / 2, (lo + hi) / 2, (model.min[2] + model.max[2]) / 2],
      half: [(model.max[0] - model.min[0]) / 2 + pad, (hi - lo) / 2, (model.max[2] - model.min[2]) / 2 + pad],
      angle: 0,
    };
  }
  if (v.kind === 'section' && v.section) {
    const { a, b, depth } = v.section;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    // As in Revit, a section drawn left to right looks up the screen (north): the viewing direction is
    // the line turned clockwise. The box's local z is that direction, its local x runs along the line.
    const angle = Math.atan2(dz, -dx);
    const n: [number, number] = [dz / len, -dx / len];
    const cy = (model.min[1] + model.max[1]) / 2;
    return {
      center: [(a[0] + b[0]) / 2 + (n[0] * depth) / 2, cy, (a[1] + b[1]) / 2 + (n[1] * depth) / 2],
      half: [len / 2, (model.max[1] - model.min[1]) / 2 + pad, depth / 2],
      angle,
    };
  }
  return null;
}

/** Direction from the model toward the camera for a view (plans look down, north up). */
export function viewDirection(v: ModelView): [number, number, number] | null {
  if (v.kind === 'plan') return [0, 1, 0];
  if (v.kind === 'elevation') return v.direction ?? [0, 0, 1];
  if (v.kind === 'section' && v.section) {
    const { a, b } = v.section;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    return [-dz / len + 0, 0, dx / len + 0]; // opposite the viewing direction: stand behind the cut (+ 0 drops -0)
  }
  return null;
}

/** Revit's Duplicate View: same settings, new name ("… Copy 1"); temporary hides are not copied. */
export function duplicateView(v: ModelView, all: ReadonlyArray<ModelView>): ModelView {
  let n = 1;
  while (all.some((x) => x.name === `${v.name} Copy ${n}`)) n++;
  return { ...structuredClone(v), id: `${v.kind}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: `${v.name} Copy ${n}` };
}

export function nextSectionName(all: ReadonlyArray<ModelView>): string {
  let n = 1;
  while (all.some((x) => x.kind === 'section' && x.name === `Section ${n}`)) n++;
  return `Section ${n}`;
}
