/**
 * Hosting (docs/design/datums-and-constraints.md, decision 24A): elements placed relative to levels, as Revit
 * places them. Columns, pedestals and walls span from a base level + offset to a top level + offset (they
 * stretch when a level moves); beams, slabs, footings, PCC and chajjas hang from a reference level by their
 * top + offset and keep their depth (they move with the level). Heights are mm in the parametric frame
 * (the viewer's height × 1000), the frame levelHeightsOf calibrates against the geometry.
 */
import { levelHeightsOf } from './levelRule';
import type { ParsedModel } from './types';
import type { ElementKind, ParamElement } from './parametric';

export interface LevelDatum {
  name: string;
  /** mm, in the parametric frame. */
  z: number;
}
export interface Hosting {
  base: { level: string; offset: number };
  /** Spanning elements only: where their top is. */
  top?: { level: string; offset: number };
}

const SPANNING: ElementKind[] = ['column', 'pedestal', 'wall'];
export const spans = (kind: ElementKind) => SPANNING.includes(kind);
const TOL = 1; // mm
const r = (n: number) => Math.round(n * 10) / 10;

/** The model's levels as datums, lowest first, in the parametric frame. */
export function levelDatums(model: Pick<ParsedModel, 'info' | 'elements' | 'coordination'>): LevelDatum[] {
  return levelHeightsOf(model).map((l) => ({ name: l.name, z: r(l.y * 1000) }));
}

const below = (levels: LevelDatum[], z: number) => [...levels].reverse().find((l) => l.z <= z + TOL) ?? levels[0];
const atOrAbove = (levels: LevelDatum[], z: number) => levels.find((l) => l.z >= z - TOL) ?? levels[levels.length - 1];
const byName = (levels: LevelDatum[], name: string) => levels.find((l) => l.name === name);

/** Where an element is hosted, from its heights (null: no levels). */
export function hostOf(e: ParamElement, levels: LevelDatum[]): Hosting | null {
  if (!levels.length) return null;
  if (spans(e.kind)) {
    const base = below(levels, e.z0);
    // the top level may be the base level (Revit allows it: a stub column from a footing up to Level 1)
    const top = atOrAbove(levels, e.z1);
    return { base: { level: base.name, offset: r(e.z0 - base.z) }, top: { level: top.name, offset: r(e.z1 - top.z) } };
  }
  // hanging elements: their own level (the level rule's: lowest level at or above the top) when known
  const ref = byName(levels, e.level) ?? atOrAbove(levels, e.z1);
  return { base: { level: ref.name, offset: r(e.z1 - ref.z) } };
}

/** An element's heights from its hosting (the depth of a hanging element is kept). */
export function heightsOf(e: ParamElement, h: Hosting, levels: LevelDatum[]): { z0: number; z1: number } {
  const base = byName(levels, h.base.level);
  if (!base) return { z0: e.z0, z1: e.z1 };
  if (spans(e.kind)) {
    const z0 = r(base.z + h.base.offset);
    const top = h.top && byName(levels, h.top.level);
    return { z0, z1: top ? r(top.z + h.top!.offset) : r(z0 + (e.z1 - e.z0)) };
  }
  const z1 = r(base.z + h.base.offset);
  return { z0: r(z1 - (e.z1 - e.z0)), z1 };
}

/** The element with its hosting: kept levels, offsets from its current heights (a vertical move changes offsets). */
export function rehost(e: ParamElement, levels: LevelDatum[]): ParamElement {
  const h = e.hosting;
  if (!h) {
    const fresh = hostOf(e, levels);
    return fresh ? { ...e, hosting: fresh } : e;
  }
  const base = byName(levels, h.base.level);
  if (!base) return { ...e, hosting: hostOf(e, levels) ?? undefined };
  if (spans(e.kind)) {
    const top = h.top && byName(levels, h.top.level);
    return { ...e, hosting: { base: { level: base.name, offset: r(e.z0 - base.z) }, ...(top ? { top: { level: top.name, offset: r(e.z1 - top.z) } } : {}) } };
  }
  return { ...e, hosting: { base: { level: base.name, offset: r(e.z1 - base.z) } } };
}

/** The elements whose heights change when the levels change (a level moved): each follows its hosting. */
export function followLevels(els: Iterable<ParamElement>, levels: LevelDatum[]): ParamElement[] {
  const out: ParamElement[] = [];
  for (const e of els) {
    if (!e.hosting) continue;
    const { z0, z1 } = heightsOf(e, e.hosting, levels);
    if (Math.abs(z0 - e.z0) > 1e-6 || Math.abs(z1 - e.z1) > 1e-6) out.push({ ...e, z0, z1 });
  }
  return out;
}

/** The levels with one moved to a new height (mm). */
export const withLevel = (levels: LevelDatum[], name: string, z: number): LevelDatum[] => levels.map((l) => (l.name === name ? { ...l, z } : l)).sort((a, b) => a.z - b.z);
