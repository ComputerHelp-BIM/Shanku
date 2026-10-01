/**
 * Revit's Modify tools as pure functions on parametric elements (docs/design/native-editing.md). Each
 * returns what changed, what was created, what was deleted, and what was refused with the reason; nothing
 * is changed in place. Lengths mm, angles degrees counter-clockwise.
 */
import type { ParamElement, Pt } from '../model/parametric';

export interface EditResult {
  changed: ParamElement[];
  created: ParamElement[];
  deleted: string[];
  refused: Array<{ id: string; reason: string }>;
}
const result = (): EditResult => ({ changed: [], created: [], deleted: [], refused: [] });

/** x' = a·x + b·y + e, y' = c·x + d·y + f */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
export const translation = (dx: number, dy: number): Affine => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
export function rotation(deg: number, about: Pt): Affine {
  const t = (deg * Math.PI) / 180,
    c = Math.cos(t),
    s = Math.sin(t);
  return { a: c, b: -s, c: s, d: c, e: about[0] - c * about[0] + s * about[1], f: about[1] - s * about[0] - c * about[1] };
}
/** Reflection about the line through p and q. */
export function reflection(p: Pt, q: Pt): Affine {
  const dx = q[0] - p[0],
    dy = q[1] - p[1],
    l2 = dx * dx + dy * dy;
  const a = (dx * dx - dy * dy) / l2,
    b = (2 * dx * dy) / l2;
  return { a, b, c: b, d: -a, e: p[0] - a * p[0] - b * p[1], f: p[1] - b * p[0] + a * p[1] };
}

const r = (n: number) => Math.round(n * 1e3) / 1e3; // 0.001 mm: no drift from repeated edits
const ap = (m: Affine, p: Pt): Pt => [r(m.a * p[0] + m.b * p[1] + m.e), r(m.c * p[0] + m.d * p[1] + m.f)];
const signedArea = (pts: Pt[]) => pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1]), 0) / 2;
const tidyAngle = (deg: number) => {
  let a = ((deg % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.abs(a) < 1e-9 ? 0 : Math.round(a * 1e6) / 1e6;
};

/** An element moved by an affine map in plan and dz in height. */
export function transform(e: ParamElement, m: Affine, dz = 0): ParamElement {
  const out: ParamElement = { ...e, z0: e.z0 + dz, z1: e.z1 + dz };
  if (e.center) out.center = ap(m, e.center);
  if (e.start) out.start = ap(m, e.start);
  if (e.end) out.end = ap(m, e.end);
  if (e.angle !== undefined) {
    const t = (e.angle * Math.PI) / 180;
    out.angle = tidyAngle((Math.atan2(m.c * Math.cos(t) + m.d * Math.sin(t), m.a * Math.cos(t) + m.b * Math.sin(t)) * 180) / Math.PI);
  }
  if (e.outline) {
    const o = e.outline.map((p) => ap(m, p));
    out.outline = signedArea(o) >= 0 ? o : o.reverse(); // stays counter-clockwise after a mirror
  }
  if (e.holes) out.holes = e.holes.map((h) => {
    const t = h.map((p) => ap(m, p));
    return signedArea(t) <= 0 ? t : t.reverse();
  });
  return out;
}

const guard = (e: ParamElement) => (e.pinned ? 'pinned (Unpin it first)' : null);

function each(els: ParamElement[], fn: (e: ParamElement, res: EditResult) => void): EditResult {
  const res = result();
  for (const e of els) {
    const why = guard(e);
    if (why) res.refused.push({ id: e.id, reason: why });
    else fn(e, res);
  }
  return res;
}

export const move = (els: ParamElement[], dx: number, dy: number, dz = 0) => each(els, (e, res) => res.changed.push(transform(e, translation(dx, dy), dz)));
export const rotate = (els: ParamElement[], deg: number, about: Pt) => each(els, (e, res) => res.changed.push(transform(e, rotation(deg, about))));
export const pin = (els: ParamElement[], on: boolean): EditResult => ({ ...result(), changed: els.filter((e) => !!e.pinned !== on).map((e) => ({ ...e, pinned: on })) });
export const remove = (els: ParamElement[]) => each(els, (e, res) => res.deleted.push(e.id));

/** Copy keeps the originals (pinned ones may be copied: Revit allows copying pinned elements). */
export function copy(els: ParamElement[], dx: number, dy: number, dz: number, newId: () => string): EditResult {
  return { ...result(), created: els.map((e) => ({ ...transform(e, translation(dx, dy), dz), id: newId(), pinned: false, source: undefined })) };
}

/** Mirror about the line p → q; a copy unless move is asked for (Revit's Mirror copies by default). */
export function mirror(els: ParamElement[], p: Pt, q: Pt, opts: { copy?: boolean; newId: () => string }): EditResult {
  if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) return { ...result(), refused: els.map((e) => ({ id: e.id, reason: 'the mirror axis has no length' })) };
  const m = reflection(p, q);
  if (opts.copy ?? true) return { ...result(), created: els.map((e) => ({ ...transform(e, m), id: opts.newId(), pinned: false, source: undefined })) };
  return each(els, (e, res) => res.changed.push(transform(e, m)));
}

/** Linear array: `count` in all, the originals first, each next one (dx, dy, dz) further. */
export function arrayLinear(els: ParamElement[], dx: number, dy: number, dz: number, count: number, newId: () => string): EditResult {
  const res = result();
  if (!Number.isInteger(count) || count < 2) return { ...res, refused: els.map((e) => ({ id: e.id, reason: 'an array needs a count of 2 or more' })) };
  for (let k = 1; k < count; k++) for (const e of els) res.created.push({ ...transform(e, translation(dx * k, dy * k), dz * k), id: newId(), pinned: false, source: undefined });
  return res;
}

const unit = (a: Pt, b: Pt): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};

/** Offset: a beam or wall moved (or copied) parallel to itself; positive to the left of start → end. */
export function offset(els: ParamElement[], distance: number, opts: { copy?: boolean; newId: () => string }): EditResult {
  const res = result();
  for (const e of els) {
    if (!e.start || !e.end) {
      res.refused.push({ id: e.id, reason: 'Offset works on beams and walls' });
      continue;
    }
    const u = unit(e.start, e.end);
    const n: Pt = [-u[1] * distance, u[0] * distance];
    const t = transform(e, translation(n[0], n[1]));
    if (opts.copy) res.created.push({ ...t, id: opts.newId(), pinned: false, source: undefined });
    else if (e.pinned) res.refused.push({ id: e.id, reason: 'pinned (Unpin it first)' });
    else res.changed.push(t);
  }
  return res;
}

/** The element's half-width across a direction n (unit), for its faces. */
function halfAcross(e: ParamElement, n: Pt): number {
  if (e.shape === 'round' && e.diameter) return e.diameter / 2;
  if (e.center && e.width !== undefined && e.length !== undefined) {
    const t = ((e.angle ?? 0) * Math.PI) / 180;
    const u: Pt = [Math.cos(t), Math.sin(t)],
      v: Pt = [-Math.sin(t), Math.cos(t)];
    return (Math.abs(u[0] * n[0] + u[1] * n[1]) * e.width + Math.abs(v[0] * n[0] + v[1] * n[1]) * e.length) / 2;
  }
  if (e.thickness !== undefined) return e.thickness / 2;
  return 0;
}

/**
 * Align (AL): each element moved across the reference line p → q so its centre — or its face nearest the
 * line — lies on it. Beams and walls must be parallel to the line (Revit refuses otherwise).
 */
export function align(els: ParamElement[], p: Pt, q: Pt, to: 'center' | 'face'): EditResult {
  const u = unit(p, q);
  const n: Pt = [-u[1], u[0]];
  return each(els, (e, res) => {
    let ref: Pt | undefined = e.center;
    if (e.start && e.end) {
      const d = unit(e.start, e.end);
      if (Math.abs(d[0] * n[0] + d[1] * n[1]) > 1e-6) return void res.refused.push({ id: e.id, reason: 'not parallel to the reference' });
      ref = e.start;
    }
    if (!ref) return void res.refused.push({ id: e.id, reason: 'Align works on columns, footings, beams and walls' });
    const dist = (ref[0] - p[0]) * n[0] + (ref[1] - p[1]) * n[1]; // signed distance of the centre from the line
    const shift = to === 'center' ? -dist : -(dist - Math.sign(dist || 1) * halfAcross(e, n));
    if (Math.abs(shift) < 1e-9) return void res.changed.push(e);
    res.changed.push(transform(e, translation(n[0] * shift, n[1] * shift)));
  });
}
