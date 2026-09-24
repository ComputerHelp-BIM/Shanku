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
  /**
   * Plan: Revit's View Range as offsets from the level, in metres, either sign: the cut plane (default
   * +1.2) and the view depth (default −1.2). The depth must be below the cut.
   */
  cutOffset?: number;
  depthOffset?: number;
  /** @deprecated saved before 0.20.2 as a positive distance below the level; read by normalizeView. */
  viewDepth?: number;
  /** Revit's Show Hidden Lines: edges behind other elements drawn dashed (on in structural plans). */
  hiddenLines?: boolean;
  /** Elevation: direction from the model toward the viewer (world, Y up). */
  direction?: [number, number, number];
  /** Section: line in plan (world x, z) and far-clip depth in metres. */
  section?: { a: [number, number]; b: [number, number]; depth: number };
  graphics: ViewGraphics;
  displayStyle: DisplayStyle;
  edges: boolean;
}

export const DEFAULT_CUT = 1.2;
export const DEFAULT_DEPTH_OFFSET = -1.2;
/** The slab transparency 0.20.0 put in new plans; removed from saved plans by normalizeView. */
const OLD_PLAN_SLAB_TRANSPARENCY = 70;

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
    // Structural plans show what is under the slab as dashed hidden lines, as Revit does.
    views.push({ id: `plan:${l.name}`, kind: 'plan', name: l.name, level: l.name, cutOffset: DEFAULT_CUT, depthOffset: DEFAULT_DEPTH_OFFSET, hiddenLines: true, ...fresh() });
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
    const lo = h + (v.depthOffset ?? DEFAULT_DEPTH_OFFSET), hi = h + (v.cutOffset ?? DEFAULT_CUT);
    if (hi - lo < 0.01) return null; // invalid range; Properties refuses it, but never clip everything away
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

/** Brings a saved view up to date (View Range offsets, no default slab transparency, hidden lines). */
export function normalizeView(v: ModelView): ModelView {
  if (v.kind !== 'plan') return v;
  const out: ModelView = { ...v };
  if (out.depthOffset === undefined) out.depthOffset = out.viewDepth !== undefined ? -out.viewDepth : DEFAULT_DEPTH_OFFSET;
  delete out.viewDepth;
  if (out.cutOffset === undefined) out.cutOffset = DEFAULT_CUT;
  if (out.hiddenLines === undefined) out.hiddenLines = true;
  const slab = out.graphics.categories.Slab;
  if (slab && slab.transparency === OLD_PLAN_SLAB_TRANSPARENCY && Object.keys(slab).length === 1) {
    const { Slab: _drop, ...rest } = out.graphics.categories;
    void _drop;
    out.graphics = { ...out.graphics, categories: rest };
  }
  return out;
}

/** A View Range change is valid when the view depth stays below the cut plane. */
export function validRange(cut: number, depth: number): boolean {
  return Number.isFinite(cut) && Number.isFinite(depth) && cut - depth >= 0.01;
}

/**
 * Revit: a section drawn in an elevation or section view is a vertical cut across that view. Its line
 * in plan runs along the view's depth through the picked position; drawn upward it looks to the
 * screen's right, downward to its left.
 */
export function sectionFromVerticalView(
  p1: [number, number, number],
  p2: [number, number, number],
  towardCamera: [number, number, number],
  span: number,
): { a: [number, number]; b: [number, number] } {
  const f = [-towardCamera[0], -towardCamera[2]]; // view direction, horizontal
  const fl = Math.hypot(f[0], f[1]) || 1;
  const right = [-f[1] / fl, f[0] / fl]; // screen right (x, z) for a level camera: forward × up
  const sign = p2[1] >= p1[1] ? 1 : -1;
  const n = [right[0] * sign, right[1] * sign]; // the new section looks this way
  const d = [-n[1], n[0]]; // line direction with n = (d.z, −d.x), our section convention
  const mx = (p1[0] + p2[0]) / 2, mz = (p1[2] + p2[2]) / 2;
  return { a: [mx - (d[0] * span) / 2, mz - (d[1] * span) / 2], b: [mx + (d[0] * span) / 2, mz + (d[1] * span) / 2] };
}

export type SectionGrip = 'a' | 'b' | 'far' | 'move' | 'flip';

/**
 * Revit's section grips, applied to a section's line (plan x, z) and far clip. Ends slide along the
 * line (the angle never drifts), with at least 0.2 m of line left; the far clip follows the pointer's
 * distance from the line (at least 0.1 m); move translates both ends; flip swaps them, which reverses
 * the viewing direction.
 */
export function editSection(
  s: { a: [number, number]; b: [number, number]; depth: number },
  grip: SectionGrip,
  start: readonly [number, number, number],
  point: readonly [number, number, number],
): { a: [number, number]; b: [number, number]; depth: number } {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const d = [dx / len, dz / len];
  const n = [d[1], -d[0]]; // viewing direction (our convention)
  const p = [point[0], point[2]];
  const MIN = 0.2;
  switch (grip) {
    case 'a': {
      const t = Math.min((p[0] - s.b[0]) * d[0] + (p[1] - s.b[1]) * d[1], -MIN);
      return { ...s, a: [s.b[0] + d[0] * t, s.b[1] + d[1] * t] };
    }
    case 'b': {
      const t = Math.max((p[0] - s.a[0]) * d[0] + (p[1] - s.a[1]) * d[1], MIN);
      return { ...s, b: [s.a[0] + d[0] * t, s.a[1] + d[1] * t] };
    }
    case 'far':
      return { ...s, depth: Math.max(0.1, (p[0] - s.a[0]) * n[0] + (p[1] - s.a[1]) * n[1]) };
    case 'move': {
      const mx = point[0] - start[0], mz = point[2] - start[2];
      return { ...s, a: [s.a[0] + mx, s.a[1] + mz], b: [s.b[0] + mx, s.b[1] + mz] };
    }
    case 'flip':
      return { ...s, a: s.b, b: s.a };
  }
}
