/**
 * Parametric elements: the model Shanku edits (docs/design/native-editing.md, decision 16A).
 *
 * The same shape as the exchange DXF → 3D and Export to Revit use, plus identity and state. Lengths are mm,
 * in the model's plan (X east, Y north) and heights from the project's ±0. IFC is generated from these on
 * save; models from IFC are turned into them from their geometry (deriveElement), and what does not fit
 * cleanly stays as reference: shown and measured, never edited (17A).
 */
import type { RevitExchange, RevitExchangeElement } from '../pipeline/types';

export type ElementKind = 'column' | 'pedestal' | 'beam' | 'wall' | 'slab' | 'chajja' | 'footing' | 'pcc';
export type Pt = [number, number];

export interface ParamElement {
  /** Identity everywhere: the IFC GlobalId (models from IFC) or the drawing's stable id (DXF → 3D). */
  id: string;
  kind: ElementKind;
  mark: string;
  material: string | null;
  level: string;
  /** Bottom and top, mm from ±0. */
  z0: number;
  z1: number;
  type?: string;
  /** Point-based (columns, pedestals, footings, PCC): rectangle W (along angle) × L, or round Ø. */
  shape?: 'rect' | 'round';
  center?: Pt;
  width?: number;
  length?: number;
  diameter?: number;
  /** Degrees, counter-clockwise from +X. */
  angle?: number;
  /** Line-based (beams, walls): the centreline and its section. */
  start?: Pt;
  end?: Pt;
  thickness?: number;
  depth?: number;
  /** Area-based (slabs, chajjas; outlined footings and PCC): counter-clockwise, holes clockwise. */
  outline?: Pt[];
  holes?: Pt[][];
  pinned?: boolean;
  /** Where it is placed relative to levels (model/hosting): heights follow the levels. */
  hosting?: import('./hosting').Hosting;
  /** Ids in the source model it was made from (Revit element and type ids, the drawing's handle). */
  source?: { revitId?: number; revitTypeId?: number; handle?: string };
}

/** Elements that could not be turned into parametric records, kept as they are (17A). */
export interface ReferenceElement {
  id: string;
  reason: string;
}

const POINT_KINDS: ElementKind[] = ['column', 'pedestal', 'footing', 'pcc'];
const LINE_KINDS: ElementKind[] = ['beam', 'wall'];
export const isPointBased = (e: ParamElement) => !!e.center;
export const isLineBased = (e: ParamElement) => !!e.start && !!e.end;
export const isAreaBased = (e: ParamElement) => !!e.outline;

/** DXF → 3D's exchange → parametric elements (doors and windows are hosted; they come later). */
export function fromExchange(ex: RevitExchange): ParamElement[] {
  return ex.elements
    .filter((e): e is RevitExchangeElement & { kind: ElementKind } => e.kind !== 'window' && e.kind !== 'door')
    .map((e) => {
      const { id, kind, mark, material, level, z0, z1, ...rest } = e;
      return { id, kind, mark, material, level, z0, z1, ...rest, source: { handle: id } };
    });
}

// ---- from IFC geometry ---------------------------------------------------------------------------------

/** The kinds Shanku can turn into parametric elements, from its categories. */
export function kindForCategory(category: string, ifcClass = ''): ElementKind | null {
  switch (category) {
    case 'Column':
      return 'column';
    case 'Beam':
      return 'beam';
    case 'Wall':
      return 'wall';
    case 'Slab':
      return /ROOF/i.test(ifcClass) ? null : 'slab';
    case 'Footing':
      return 'footing';
    default:
      return null;
  }
}

/** A triangle in plan mm (x, y) with its height z (mm): what deriveElement reads. */
export type Tri = [[number, number, number], [number, number, number], [number, number, number]];

/** Viewer (Y-up, metres) → plan mm and height mm. web-ifc turns IFC's Z-up into Y-up: plan Y is −z. */
export const planOf = (x: number, y: number, z: number): [number, number, number] => [x * 1000, -z * 1000, y * 1000];

/** An element's triangles from the model's merged mesh, in plan mm. */
export function trianglesOf(mesh: { positions: Float32Array; elementIds: Float32Array; indices: Uint32Array }, index: number): Tri[] {
  const out: Tri[] = [];
  const p = mesh.positions;
  const v = (i: number) => planOf(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t];
    if (mesh.elementIds[a] !== index) continue;
    out.push([v(a), v(mesh.indices[t + 1]), v(mesh.indices[t + 2])]);
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10; // 0.1 mm
const area = (pts: Pt[]) => pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1]), 0) / 2;

function hull(points: Pt[]): Pt[] {
  const pts = [...new Map(points.map((p) => [`${r1(p[0])},${r1(p[1])}`, p] as const)).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The smallest rectangle around a convex hull (rotating calipers): centre, sides along and across `angle`. */
export function minRect(h: Pt[]): { center: Pt; along: number; across: number; angle: number; area: number } {
  let best = { center: [0, 0] as Pt, along: 0, across: 0, angle: 0, area: Infinity };
  for (let i = 0; i < h.length; i++) {
    const a = h[i],
      b = h[(i + 1) % h.length];
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(th),
      s = Math.sin(th);
    let u0 = Infinity,
      u1 = -Infinity,
      v0 = Infinity,
      v1 = -Infinity;
    for (const p of h) {
      const u = p[0] * c + p[1] * s,
        v = -p[0] * s + p[1] * c;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const ar = (u1 - u0) * (v1 - v0);
    if (ar < best.area - 1e-6) {
      const uc = (u0 + u1) / 2,
        vc = (v0 + v1) / 2;
      best = { center: [uc * c - vc * s, uc * s + vc * c], along: u1 - u0, across: v1 - v0, angle: (th * 180) / Math.PI, area: ar };
    }
  }
  return best;
}

/** Angle in (-90, 90], so the same rectangle always gets the same angle. */
const tidyAngle = (deg: number) => {
  let a = ((deg % 180) + 180) % 180;
  if (a > 90) a -= 180;
  return Math.abs(a) < 1e-6 ? 0 : Math.round(a * 1e4) / 1e4;
};

/** Outline and holes of the top face (triangles facing up at the top): edges used once, chained. */
function topLoops(tris: Tri[], z1: number): Pt[][] {
  const top = tris.filter((t) => t.every((p) => Math.abs(p[2] - z1) < 1) && Math.abs(area(t.map((p) => [p[0], p[1]] as Pt))) > 1e-3);
  const key = (p: [number, number, number]) => `${r1(p[0])},${r1(p[1])}`;
  const count = new Map<string, number>();
  const edges: Array<[string, string]> = [];
  for (const t of top)
    for (let i = 0; i < 3; i++) {
      const a = key(t[i]),
        b = key(t[(i + 1) % 3]);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(k, (count.get(k) ?? 0) + 1);
      edges.push([a, b]);
    }
  const next = new Map<string, string[]>();
  for (const [a, b] of edges) {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (count.get(k) !== 1) continue;
    next.set(a, [...(next.get(a) ?? []), b]);
  }
  const loops: Pt[][] = [];
  const used = new Set<string>();
  for (const startKey of next.keys()) {
    if (used.has(startKey)) continue;
    const loop: string[] = [];
    let cur: string | undefined = startKey;
    while (cur && !used.has(cur)) {
      used.add(cur);
      loop.push(cur);
      cur = next.get(cur)?.find((n) => !used.has(n)) ?? undefined;
    }
    if (loop.length >= 3) loops.push(simplify(loop.map((s) => s.split(',').map(Number) as Pt)));
  }
  return loops;
}

/** Drops points that lie on the line between their neighbours. */
function simplify(pts: Pt[]): Pt[] {
  const out = pts.filter((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length],
      b = pts[(i + 1) % pts.length];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-3 * Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  return out.length >= 3 ? out : pts;
}

/**
 * An IFC element's triangles (plan mm) → a parametric element, or a reference with the reason it was not
 * converted. Only clean shapes convert: a rectangle or circle in plan for point-based elements, a rectangle
 * for beams and walls, a flat-topped outline for slabs.
 */
export function deriveElement(
  base: { id: string; kind: ElementKind; mark: string; material: string | null; level: string; type?: string },
  tris: Tri[],
  /** The IFC's own volume (m³), when it states one: the parameters must reproduce it (within 5 %). */
  expectedVolume?: number,
): ParamElement | ReferenceElement {
  const derived = derive(base, tris);
  if (isReference(derived) || !expectedVolume || expectedVolume <= 0) return derived;
  const v = volumeOf(derived);
  const diff = v / expectedVolume - 1;
  return Math.abs(diff) > 0.05 ? { id: base.id, reason: `its parameters would change its volume by ${Math.round(diff * 100)} %` } : derived;
}

/** An element's volume from its parameters (m³). */
export function volumeOf(e: ParamElement): number {
  const h = (e.z1 - e.z0) / 1000;
  if (e.shape === 'round' && e.diameter) return Math.PI * (e.diameter / 2000) ** 2 * h;
  if (e.center && e.width !== undefined && e.length !== undefined) return (e.width / 1000) * (e.length / 1000) * h;
  if (e.start && e.end && e.thickness !== undefined) return (Math.hypot(e.end[0] - e.start[0], e.end[1] - e.start[1]) / 1000) * (e.thickness / 1000) * h;
  if (e.outline) return ((Math.abs(area(e.outline)) - (e.holes ?? []).reduce((s, x) => s + Math.abs(area(x)), 0)) / 1e6) * h;
  return 0;
}

function derive(base: { id: string; kind: ElementKind; mark: string; material: string | null; level: string; type?: string }, tris: Tri[]): ParamElement | ReferenceElement {
  if (!tris.length) return { id: base.id, reason: 'no geometry' };
  const pts = tris.flat();
  const z0 = Math.min(...pts.map((p) => p[2])),
    z1 = Math.max(...pts.map((p) => p[2]));
  const plan = pts.map((p) => [p[0], p[1]] as Pt);
  const h = hull(plan);
  const hullArea = Math.abs(area(h));
  const common = { ...base, z0: Math.round(z0), z1: Math.round(z1) };
  if (POINT_KINDS.includes(base.kind) || LINE_KINDS.includes(base.kind)) {
    const r = minRect(h);
    // a circle: hull points all about the same distance from the centre, and many of them
    const c: Pt = [h.reduce((s, p) => s + p[0], 0) / h.length, h.reduce((s, p) => s + p[1], 0) / h.length];
    const radii = h.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]));
    const mean = radii.reduce((s, x) => s + x, 0) / radii.length;
    if (POINT_KINDS.includes(base.kind) && h.length >= 12 && radii.every((x) => Math.abs(x - mean) < Math.max(2, mean * 0.02))) {
      return { ...common, shape: 'round', center: [r1(c[0]), r1(c[1])], diameter: Math.round(mean * 2) };
    }
    if (hullArea < r.area * 0.98 || h.length > 8) return { id: base.id, reason: 'not a rectangle in plan' };
    if (POINT_KINDS.includes(base.kind)) {
      return { ...common, shape: 'rect', center: [r1(r.center[0]), r1(r.center[1])], width: Math.round(r.along), length: Math.round(r.across), angle: tidyAngle(r.angle) };
    }
    // beams and walls: the long side is the centreline
    const longAlong = r.along >= r.across;
    const len = Math.max(r.along, r.across),
      thick = Math.min(r.along, r.across);
    const th = ((r.angle + (longAlong ? 0 : 90)) * Math.PI) / 180;
    const d: Pt = [(Math.cos(th) * len) / 2, (Math.sin(th) * len) / 2];
    return { ...common, start: [r1(r.center[0] - d[0]), r1(r.center[1] - d[1])], end: [r1(r.center[0] + d[0]), r1(r.center[1] + d[1])], thickness: Math.round(thick), depth: Math.round(z1 - z0) };
  }
  // slabs, chajjas, outlined footings: the top face's loops
  const loops = topLoops(tris, z1).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  if (!loops.length) return { id: base.id, reason: 'no flat top face (sloped or curved)' };
  const ccw = (l: Pt[]) => (area(l) >= 0 ? l : [...l].reverse());
  const cw = (l: Pt[]) => (area(l) <= 0 ? l : [...l].reverse());
  const [outline, ...rest] = loops;
  // a loop inside the outline is a hole; one outside it is a separate piece of the same element, which a
  // single outline cannot hold: kept as reference rather than half converted
  if (rest.some((l) => !inside(l[0], outline))) return { id: base.id, reason: 'in separate pieces' };
  // every point of the element within its outline: a step, a sunk part or an overhang is not one flat slab
  if (plan.some((p) => !inside(p, outline) && distanceToPolygon(p, outline) > 1)) return { id: base.id, reason: 'not one flat outline (a step, a sunk part or an overhang)' };
  return { ...common, outline: ccw(outline), ...(rest.length ? { holes: rest.map(cw) } : {}), thickness: Math.round(z1 - z0) };
}

function distanceToPolygon(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return best;
}

/** Point in polygon (even-odd). */
function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export const isReference = (e: ParamElement | ReferenceElement): e is ReferenceElement => 'reason' in e;
