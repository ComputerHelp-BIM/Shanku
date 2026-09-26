import { Vector3 } from 'three';
import type { ElementRecord } from '../model/types';
import { cutSegments, type MeasureScene } from './measure';

/**
 * Revit's Annotate → Dimension panel as permanent view annotations: Aligned, Linear, Angular,
 * Radial, Diameter, Arc Length, Spot Elevation, Spot Coordinate and Spot Slope. A dimension is plain
 * data (JSON: saved with its view, undoable), drawn as an SVG overlay that follows the camera.
 *
 * Coordinates are the viewer's (metres, Y up, north = −Z). Values shown to people: millimetres for
 * lengths, degrees for angles, metres to 3 decimals for spot elevations and coordinates, relative to
 * the file's own origin (the origin shift web-ifc applies is taken back off).
 */
export type DimensionKind = 'aligned' | 'linear' | 'angular' | 'radial' | 'diameter' | 'arcLength' | 'spotElevation' | 'spotCoordinate' | 'spotSlope';

export type Vec3 = [number, number, number];

export const DIMENSION_TOOLS: ReadonlyArray<{ id: DimensionKind; label: string; icon: string; keys?: string; tip: string }> = [
  { id: 'aligned', label: 'Aligned', icon: 'dimAligned', keys: 'DI', tip: 'Between parallel references or two points, measured square to them; keep picking to make a string, click away to place' },
  { id: 'linear', label: 'Linear', icon: 'dimLinear', tip: 'Horizontal or vertical in the view between two points; move the cursor to choose which' },
  { id: 'angular', label: 'Angular', icon: 'dimAngular', tip: 'The angle between two edges or centrelines' },
  { id: 'radial', label: 'Radial', icon: 'dimRadial', tip: 'Radius of a circular edge: round column, pile or curved beam' },
  { id: 'diameter', label: 'Diameter', icon: 'dimDiameter', tip: 'Diameter of a circular edge' },
  { id: 'arcLength', label: 'Arc Length', icon: 'dimArc', tip: 'Length along a curved edge' },
  { id: 'spotElevation', label: 'Spot Elevation', icon: 'spotElevation', keys: 'EL', tip: 'Elevation of a point (top of slab, beam soffit, founding level), from the file’s origin' },
  { id: 'spotCoordinate', label: 'Spot Coordinate', icon: 'spotCoordinate', tip: 'North and east coordinates of a point, from the file’s origin' },
  { id: 'spotSlope', label: 'Spot Slope', icon: 'spotSlope', tip: 'Slope of a face, with an arrow pointing downhill' },
];

export interface DimensionText {
  prefix?: string;
  suffix?: string;
  /** Second line under the value (Revit's Below). */
  below?: string;
  /** Replaces the value (Revit's Replace With Text). */
  replace?: string;
}

export interface PlacedDimension {
  id: string;
  kind: DimensionKind;
  /**
   * The references, by kind: aligned / linear: two or more points (a string); angular: a point on each
   * line; radial / diameter / arc length: two points on the arc (its ends); spots: the point.
   */
  points: Vec3[];
  /** The element each point is on (GlobalId) and that element's centre when placed, so the dimension follows it. */
  refs: Array<{ globalId: string; anchor: Vec3 } | null>;
  /** Where the dimension line / arc / text goes. */
  at: Vec3;
  /** The plane the dimension lies in (unit normal): the view direction in 2D views, a work plane in 3D. */
  normal: Vec3;
  /** Aligned and linear: the direction measured along (unit, in the plane). */
  dir?: Vec3;
  /** Angular: the line directions (unit, in the plane) through points[0] and points[1]. */
  lines?: [Vec3, Vec3];
  /** Radial, diameter, arc length: the arc found on the element. */
  arc?: { centre: Vec3; radius: number; start: Vec3; end: Vec3; sweep: number; closed: boolean };
  /** Spot slope: the face normal. */
  slope?: Vec3;
  text?: DimensionText;
}

const v = (a: Vec3) => new Vector3(a[0], a[1], a[2]);
const arr = (p: Vector3): Vec3 => [p.x, p.y, p.z];

/** In-plane basis (u, w) for a unit normal n. */
export function planeBasis(n: Vector3): [Vector3, Vector3] {
  const ref = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(ref, n).normalize();
  const w = new Vector3().crossVectors(n, u).normalize();
  return [u, w];
}

export const projectOnPlane = (p: Vector3, n: Vector3) => p.clone().addScaledVector(n, -p.dot(n));

// ------------------------------------------------------------------ values

/** Segment values of an aligned / linear string (m): each step between references, along `dir`. */
export function stringValues(d: PlacedDimension): number[] {
  const u = v(d.dir ?? [1, 0, 0]);
  const t = d.points.map((p) => v(p).dot(u)).sort((a, b) => a - b);
  const out: number[] = [];
  for (let k = 1; k < t.length; k++) out.push(t[k] - t[k - 1]);
  return out;
}

/** Where two in-plane lines meet (null when parallel). */
export function lineIntersection(p1: Vector3, d1: Vector3, p2: Vector3, d2: Vector3, n: Vector3): Vector3 | null {
  const [u, w] = planeBasis(n);
  const x1 = p1.dot(u), y1 = p1.dot(w), a1 = d1.dot(u), b1 = d1.dot(w);
  const x2 = p2.dot(u), y2 = p2.dot(w), a2 = d2.dot(u), b2 = d2.dot(w);
  const den = a1 * b2 - b1 * a2;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x2 - x1) * b2 - (y2 - y1) * a2) / den;
  return p1.clone().addScaledVector(d1, t);
}

/**
 * Angular: the vertex, the two rays that bound the sector holding `at` (Revit offers the four
 * quadrants of the crossing lines by where you place the arc), and the angle in degrees.
 */
export function angularSector(d: PlacedDimension): { vertex: Vector3; a: Vector3; b: Vector3; degrees: number } | null {
  if (!d.lines) return null;
  const n = v(d.normal);
  const d1 = v(d.lines[0]), d2 = v(d.lines[1]);
  const vertex = lineIntersection(v(d.points[0]), d1, v(d.points[1]), d2, n);
  if (!vertex) return null;
  const wdir = projectOnPlane(v(d.at).sub(vertex), n);
  if (wdir.lengthSq() < 1e-12) wdir.copy(d1).add(d2);
  wdir.normalize();
  for (const s1 of [1, -1]) {
    for (const s2 of [1, -1]) {
      const a = d1.clone().multiplyScalar(s1), b = d2.clone().multiplyScalar(s2);
      const ab = a.angleTo(b);
      if (ab > Math.PI - 1e-6) continue;
      if (Math.abs(a.angleTo(wdir) + wdir.angleTo(b) - ab) < 1e-6) return { vertex, a, b, degrees: (ab * 180) / Math.PI };
    }
  }
  return { vertex, a: d1, b: d2, degrees: (d1.angleTo(d2) * 180) / Math.PI };
}

/** Slope of a face from its normal: rise over run (null for a vertical face). */
export function slopeOf(normal: Vector3): { ratio: number; degrees: number; downhill: Vector3 } | null {
  const n = normal.clone().normalize();
  if (n.y < 0) n.negate();
  if (Math.abs(n.y) < 1e-6) return null;
  const h = new Vector3(n.x, 0, n.z);
  const ratio = h.length() / n.y;
  // Downhill along the face: the horizontal part of the normal points downhill.
  const downhill = h.lengthSq() > 1e-12 ? projectOnPlane(h.clone().normalize(), n).normalize() : new Vector3(1, 0, 0);
  return { ratio, degrees: (Math.atan(ratio) * 180) / Math.PI, downhill };
}

/** Origin of the file in the viewer (web-ifc's COORDINATE_TO_ORIGIN shift), so spot values are the file's own. */
export type Origin = Vec3;

const mmText = (m: number) => Math.round(m * 1000).toLocaleString('en-IN');
const mText = (m: number) => `${m >= 0 ? '+' : '−'}${Math.abs(m).toFixed(3)}`;

/** The text(s) a dimension shows: one per segment for strings, one otherwise (before prefix / suffix). */
export function dimensionValues(d: PlacedDimension, origin: Origin = [0, 0, 0]): string[] {
  switch (d.kind) {
    case 'aligned':
    case 'linear':
      return stringValues(d).map(mmText);
    case 'angular': {
      const s = angularSector(d);
      return [s ? `${s.degrees.toFixed(2)}°` : '—'];
    }
    case 'radial':
      return [d.arc ? `R ${mmText(d.arc.radius)}` : '—'];
    case 'diameter':
      return [d.arc ? `⌀ ${mmText(d.arc.radius * 2)}` : '—'];
    case 'arcLength':
      return [d.arc ? `⌒ ${mmText(d.arc.radius * d.arc.sweep)}` : '—'];
    case 'spotElevation':
      return [`EL ${mText(d.points[0][1] - origin[1])}`];
    case 'spotCoordinate':
      return [`N ${mText(-(d.points[0][2] - origin[2]))}`, `E ${mText(d.points[0][0] - origin[0])}`];
    case 'spotSlope': {
      const s = d.slope ? slopeOf(v(d.slope)) : null;
      if (!s) return ['Vertical'];
      if (s.ratio < 1e-5) return ['Level (0%)'];
      return [`${(s.ratio * 100).toFixed(2)}%`];
    }
  }
}

/** Value text with the user's prefix / suffix / replacement (Revit's Dimension Text). */
export function dimensionLabel(d: PlacedDimension, value: string): string {
  const t = d.text;
  if (!t) return value;
  const core = t.replace?.trim() ? t.replace.trim() : value;
  return [t.prefix?.trim(), core, t.suffix?.trim()].filter(Boolean).join(' ');
}

/** Plain-text summary for Properties and the clipboard: "Aligned: 4,500 + 1,200 = 5,700 mm". */
export function dimensionSummary(d: PlacedDimension, origin: Origin = [0, 0, 0]): string {
  const vals = dimensionValues(d, origin);
  const name = DIMENSION_TOOLS.find((t) => t.id === d.kind)?.label ?? d.kind;
  if ((d.kind === 'aligned' || d.kind === 'linear') && vals.length > 1) {
    const total = stringValues(d).reduce((a, b) => a + b, 0);
    return `${name}: ${vals.join(' + ')} = ${mmText(total)} mm`;
  }
  return `${name}: ${vals.join(', ')}${d.kind === 'aligned' || d.kind === 'linear' ? ' mm' : ''}`;
}

// ------------------------------------------------------------------ arcs on elements

export interface FoundArc {
  centre: Vector3;
  radius: number;
  normal: Vector3;
  start: Vector3;
  end: Vector3;
  /** Radians swept from start to end (2π for a full circle). */
  sweep: number;
  closed: boolean;
  /** The polyline of the arc as drawn (for highlighting). */
  points: Vector3[];
}

/** Circle through three points (null when they are in a line). */
export function circleThrough(a: Vector3, b: Vector3, c: Vector3): { centre: Vector3; radius: number; normal: Vector3 } | null {
  const ab = new Vector3().subVectors(b, a), ac = new Vector3().subVectors(c, a);
  const n = new Vector3().crossVectors(ab, ac);
  const n2 = n.lengthSq();
  if (n2 < 1e-14) return null;
  const t1 = new Vector3().crossVectors(n, ab).multiplyScalar(ac.lengthSq());
  const t2 = new Vector3().crossVectors(ac, n).multiplyScalar(ab.lengthSq());
  const centre = a.clone().add(t1.add(t2).divideScalar(2 * n2));
  return { centre, radius: centre.distanceTo(a), normal: n.normalize() };
}

const key = (p: Vector3) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;

/**
 * The arc (or circle) a picked edge belongs to: the element's feature edges chained end to end from
 * that segment, in one plane, turning the same way by less than 40° each, of similar length (a
 * tessellated circle). Checked against the fitted circle within 1.5 % of its radius.
 */
export function arcFromEdge(s: MeasureScene, index: number, a: Vector3, b: Vector3): FoundArc | null {
  return arcFromSegments(elementEdges(s, index), a, b) ?? (s.cuts?.length ? arcFromSegments(cutSegments(s, index), a, b) : null);
}

/** An element's feature edges where drawn (exploded offset applied). */
function elementEdges(s: MeasureScene, index: number): Array<[Vector3, Vector3]> {
  const off = s.offset(index);
  const E = s.edges.positions;
  const segs: Array<[Vector3, Vector3]> = [];
  for (let q = s.index.edgeStart[index]; q < s.index.edgeStart[index + 1]; q++) {
    const k = s.index.edges[q] * 6;
    const p = new Vector3(E[k], E[k + 1], E[k + 2]), r = new Vector3(E[k + 3], E[k + 4], E[k + 5]);
    if (off) {
      p.set(p.x + off[0], p.y + off[1], p.z + off[2]);
      r.set(r.x + off[0], r.y + off[1], r.z + off[2]);
    }
    if (p.distanceToSquared(r) > 1e-12) segs.push([p, r]);
  }
  return segs;
}

/** The arc (or circle) segment a–b belongs to, among the given segments (see `arcFromEdge`). */
export function arcFromSegments(segs: Array<[Vector3, Vector3]>, a: Vector3, b: Vector3): FoundArc | null {
  const start = segs.findIndex(([p, r]) => (p.distanceTo(a) < 1e-4 && r.distanceTo(b) < 1e-4) || (p.distanceTo(b) < 1e-4 && r.distanceTo(a) < 1e-4));
  if (start < 0) return null;
  const byPoint = new Map<string, number[]>();
  segs.forEach(([p, r], i) => {
    for (const x of [p, r]) {
      const kk = key(x);
      const l = byPoint.get(kk);
      if (l) l.push(i);
      else byPoint.set(kk, [i]);
    }
  });
  const len0 = segs[start][0].distanceTo(segs[start][1]);
  const used = new Set<number>([start]);
  let normal: Vector3 | null = null;
  /** Walks from `tip` (coming from `prev`) while the next segment continues the curve; returns the points passed. */
  const walk = (prev: Vector3, tip: Vector3, sign: 1 | -1): Vector3[] => {
    const out: Vector3[] = [];
    let p0 = prev, p1 = tip;
    for (let guard = 0; guard < 720; guard++) {
      const next = (byPoint.get(key(p1)) ?? []).filter((i) => !used.has(i));
      let chosen: { i: number; far: Vector3 } | null = null;
      for (const i of next) {
        const [x, y] = segs[i];
        const far = x.distanceTo(p1) < 1e-4 ? y : x;
        const d0 = new Vector3().subVectors(p1, p0), d1 = new Vector3().subVectors(far, p1);
        const l1 = d1.length();
        if (l1 > len0 * 3 || l1 < len0 / 3) continue;
        const turn = d0.angleTo(d1);
        if (turn < 1e-3 || turn > (40 * Math.PI) / 180) continue; // straight on is not an arc; a corner ends it
        const nn = new Vector3().crossVectors(d0, d1).normalize().multiplyScalar(sign);
        if (normal && nn.dot(normal) < 0.999) continue; // must turn the same way (walking back: the other way), in the same plane
        chosen = { i, far };
        normal ??= nn;
        break;
      }
      if (!chosen) break;
      used.add(chosen.i);
      out.push(chosen.far);
      p0 = p1;
      p1 = chosen.far;
    }
    return out;
  };
  const [sa, sb] = segs[start];
  const forward = walk(sa, sb, 1);
  const closedLoop = forward.length > 2 && forward[forward.length - 1].distanceTo(sa) < 1e-4;
  const backward = closedLoop ? [] : walk(sb, sa, -1);
  const pts = [...backward.reverse(), sa, sb, ...forward];
  if (closedLoop) pts.pop(); // the loop came back to its start
  if (pts.length < 4) return null; // three segments or more
  const c = circleThrough(pts[0], pts[Math.floor(pts.length / 3)], pts[Math.floor((2 * pts.length) / 3)]);
  if (!c) return null;
  if (pts.some((p) => Math.abs(p.distanceTo(c.centre) - c.radius) > c.radius * 0.015)) return null;
  if (closedLoop) {
    return { centre: c.centre, radius: c.radius, normal: c.normal, start: pts[0], end: pts[0], sweep: Math.PI * 2, closed: true, points: [...pts, pts[0]] };
  }
  // Sweep from start to end, the way the chain runs.
  let sweep = 0;
  for (let k = 1; k < pts.length; k++) sweep += new Vector3().subVectors(pts[k - 1], c.centre).angleTo(new Vector3().subVectors(pts[k], c.centre));
  return { centre: c.centre, radius: c.radius, normal: c.normal, start: pts[0], end: pts[pts.length - 1], sweep, closed: false, points: pts };
}

// ------------------------------------------------------------------ following the model

/**
 * After the model changes (a live update from Revit): each reference moves with its element (the
 * change in the element's centre), and dimensions whose elements were deleted are dropped, as in Revit.
 */
export function followModel(dims: readonly PlacedDimension[], elements: readonly ElementRecord[]): { dims: PlacedDimension[]; dropped: number; moved: number } {
  const centre = new Map<string, Vec3>();
  for (const e of elements) centre.set(e.globalId, [(e.bounds[0] + e.bounds[3]) / 2, (e.bounds[1] + e.bounds[4]) / 2, (e.bounds[2] + e.bounds[5]) / 2]);
  let dropped = 0, moved = 0;
  const out: PlacedDimension[] = [];
  for (const d of dims) {
    const deltas: Array<Vec3 | null> = d.refs.map((r) => {
      if (!r) return null;
      const c = centre.get(r.globalId);
      if (!c) return [NaN, NaN, NaN];
      return [c[0] - r.anchor[0], c[1] - r.anchor[1], c[2] - r.anchor[2]];
    });
    if (deltas.some((x) => x && Number.isNaN(x[0]))) {
      dropped++;
      continue;
    }
    if (!deltas.some((x) => x && Math.hypot(x[0], x[1], x[2]) > 1e-6)) {
      out.push(d);
      continue;
    }
    moved++;
    const add = (p: Vec3, x: Vec3 | null): Vec3 => (x ? [p[0] + x[0], p[1] + x[1], p[2] + x[2]] : p);
    const first = deltas.find((x) => x) ?? null;
    const next: PlacedDimension = {
      ...d,
      points: d.points.map((p, i) => add(p, deltas[i] ?? null)),
      refs: d.refs.map((r, i) => (r && deltas[i] ? { ...r, anchor: add(r.anchor, deltas[i]) } : r)),
      at: add(d.at, first),
    };
    if (d.arc) next.arc = { ...d.arc, centre: add(d.arc.centre, first), start: add(d.arc.start, first), end: add(d.arc.end, first) };
    out.push(next);
  }
  return { dims: out, dropped, moved };
}

// ------------------------------------------------------------------ drawing

export interface DimensionStyle {
  line: string;
  text: string;
  plate: string;
  hot: string;
  font: string;
}

type Project = (p: Vector3) => [number, number] | null;
const NS = 'http://www.w3.org/2000/svg';

/**
 * Draws dimensions into an SVG group: witness lines with a gap, a dimension line with Revit's
 * diagonal ticks (arrows on radial and diameter), the value above the line and readable from below
 * or the right. Each dimension is one hit target (`data-dim`); a selected one shows its grip
 * (`data-dim-grip`) to drag the line.
 */
export function drawDimensions(
  svg: SVGElement,
  dims: readonly PlacedDimension[],
  project: Project,
  style: DimensionStyle,
  state: { selected: ReadonlySet<string>; hot: string | null; interactive: boolean; preview?: boolean },
  origin: Origin = [0, 0, 0],
): void {
  const el = (parent: Element, tag: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, val] of Object.entries(attrs)) n.setAttribute(k, String(val));
    parent.appendChild(n);
    return n;
  };
  for (const d of dims) {
    const on = state.selected.has(d.id) || state.hot === d.id;
    const color = on ? style.hot : style.line;
    const g = el(svg, 'g', { 'data-dim': d.id, cursor: state.interactive ? 'pointer' : 'default', 'pointer-events': state.interactive ? 'visiblePainted' : 'none', opacity: state.preview ? 0.85 : 1 });
    const hitD: string[] = [];
    const line = (a: [number, number], b: [number, number], w = 1) => {
      el(g, 'line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' });
      hitD.push(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`);
    };
    const tick = (p: [number, number], ang: number) => {
      const t = 5, k = ang + Math.PI / 4;
      line([p[0] - Math.cos(k) * t, p[1] - Math.sin(k) * t], [p[0] + Math.cos(k) * t, p[1] + Math.sin(k) * t], 1.6);
    };
    const arrow = (tip: [number, number], from: [number, number]) => {
      const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
      const l = 9, w = 0.38;
      const p1: [number, number] = [tip[0] - Math.cos(ang - w) * l, tip[1] - Math.sin(ang - w) * l];
      const p2: [number, number] = [tip[0] - Math.cos(ang + w) * l, tip[1] - Math.sin(ang + w) * l];
      el(g, 'path', { d: `M${tip[0]} ${tip[1]}L${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}Z`, fill: color, stroke: 'none' });
    };
    /** Text at a point along a direction, lifted to one side, readable (never upside down). */
    const label = (at: [number, number], ang: number, lines: string[], lift = 8) => {
      let deg = (ang * 180) / Math.PI;
      let side = -1;
      if (deg > 90.5 || deg < -89.5) {
        deg += 180;
        side = 1;
      }
      deg = ((deg + 540) % 360) - 180;
      const nx = -Math.sin(ang) * side, ny = Math.cos(ang) * side;
      const cx = at[0] + nx * lift, cy = at[1] + ny * lift;
      const w = Math.max(...lines.map((s) => s.length)) * 7 + 8, h = lines.length * 14 + 2;
      const tg = el(g, 'g', { transform: `rotate(${deg.toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})` });
      el(tg, 'rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 2, fill: style.plate, 'fill-opacity': 0.82 });
      lines.forEach((s, i) => {
        const t = el(tg, 'text', { x: cx, y: cy - h / 2 + 8 + i * 14, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: on ? style.hot : style.text, 'font-size': 11.5, 'font-weight': 600, 'font-family': style.font });
        t.textContent = s;
      });
    };
    const grip = (p: [number, number]) => {
      if (!state.selected.has(d.id) || !state.interactive) return;
      el(g, 'rect', { x: p[0] - 4.5, y: p[1] - 4.5, width: 9, height: 9, fill: style.plate, stroke: style.hot, 'stroke-width': 1.5, 'data-dim-grip': d.id, cursor: 'move', 'pointer-events': 'all' });
    };
    const vals = dimensionValues(d, origin);
    const n = v(d.normal);
    if (d.kind === 'aligned' || d.kind === 'linear') {
      const u = v(d.dir ?? [1, 0, 0]);
      const at = v(d.at);
      const feet = d.points.map((p) => at.clone().addScaledVector(u, v(p).sub(at).dot(u))).map((f, i) => ({ f, p: v(d.points[i]) }));
      feet.sort((x, y) => x.f.dot(u) - y.f.dot(u));
      const S = feet.map(({ f, p }) => ({ f: project(f), p: project(p) }));
      if (S.some((x) => !x.f || !x.p)) continue;
      const first = S[0].f!, last = S[S.length - 1].f!;
      const ang = Math.atan2(last[1] - first[1], last[0] - first[0]);
      const ux = Math.cos(ang), uy = Math.sin(ang);
      line([first[0] - ux * 6, first[1] - uy * 6], [last[0] + ux * 6, last[1] + uy * 6]);
      for (const { f, p } of S) {
        const dx = f![0] - p![0], dy = f![1] - p![1], l = Math.hypot(dx, dy);
        if (l > 8) line([p![0] + (dx / l) * 4, p![1] + (dy / l) * 4], [f![0] + (dx / l) * 5, f![1] + (dy / l) * 5], 0.9);
        tick(f!, ang);
      }
      const values = stringValues({ ...d, points: feet.map((x) => arr(x.p)) });
      values.forEach((val, i) => {
        const a = S[i].f!, b = S[i + 1].f!;
        label([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ang, [dimensionLabel(d, vals[i] ?? mmText(val)), ...(d.text?.below ? [d.text.below] : [])]);
      });
      grip([(first[0] + last[0]) / 2, (first[1] + last[1]) / 2]);
    } else if (d.kind === 'angular') {
      const s = angularSector(d);
      if (!s) continue;
      const r = Math.max(1e-3, v(d.at).sub(s.vertex).length());
      const [bu, bw] = planeBasis(n);
      const a0 = Math.atan2(s.a.dot(bw), s.a.dot(bu));
      let a1 = Math.atan2(s.b.dot(bw), s.b.dot(bu));
      if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
      if (a0 - a1 > Math.PI) a1 += Math.PI * 2;
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= 32; k++) {
        const t = a0 + ((a1 - a0) * k) / 32;
        const p = project(s.vertex.clone().addScaledVector(bu, Math.cos(t) * r).addScaledVector(bw, Math.sin(t) * r));
        if (p) pts.push(p);
      }
      if (pts.length < 2) continue;
      el(g, 'polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 1 });
      hitD.push(`M${pts.map((p) => p.join(' ')).join('L')}`);
      // Witness lines along each ray from its reference to the arc.
      for (const [ray, ref] of [[s.a, v(d.points[0])], [s.b, v(d.points[1])]] as const) {
        const onRay = s.vertex.clone().addScaledVector(ray, r);
        const refOnRay = s.vertex.clone().addScaledVector(ray, Math.max(0, ref.clone().sub(s.vertex).dot(ray)));
        const A = project(refOnRay), B = project(onRay);
        if (A && B) line(A, B, 0.9);
      }
      tick(pts[0], Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]));
      tick(pts[pts.length - 1], Math.atan2(pts[pts.length - 1][1] - pts[pts.length - 2][1], pts[pts.length - 1][0] - pts[pts.length - 2][0]));
      const mid = pts[Math.floor(pts.length / 2)], m2 = pts[Math.floor(pts.length / 2) + 1] ?? mid;
      label(mid, Math.atan2(m2[1] - mid[1], m2[0] - mid[0]), [dimensionLabel(d, vals[0]), ...(d.text?.below ? [d.text.below] : [])]);
      grip(mid);
    } else if ((d.kind === 'radial' || d.kind === 'diameter' || d.kind === 'arcLength') && d.arc) {
      const c = v(d.arc.centre), an = n;
      const toward = projectOnPlane(v(d.at).sub(c), an);
      if (toward.lengthSq() < 1e-12) toward.copy(v(d.arc.start).sub(c));
      toward.normalize();
      const r = d.arc.radius;
      if (d.kind === 'arcLength') {
        const R = Math.max(r * 0.2, v(d.at).sub(c).length());
        const s0 = v(d.arc.start).sub(c).normalize(), e0 = v(d.arc.end).sub(c).normalize();
        const [bu, bw] = planeBasis(an);
        const a0 = Math.atan2(s0.dot(bw), s0.dot(bu));
        const dirSign = Math.sign(new Vector3().crossVectors(s0, e0).dot(an)) || 1;
        const sweep = d.arc.closed ? Math.PI * 2 : d.arc.sweep;
        const pts: Array<[number, number]> = [];
        for (let k = 0; k <= 48; k++) {
          const t = a0 + dirSign * sweep * (k / 48);
          const p = project(c.clone().addScaledVector(bu, Math.cos(t) * R).addScaledVector(bw, Math.sin(t) * R));
          if (p) pts.push(p);
        }
        if (pts.length < 2) continue;
        el(g, 'polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 1 });
        hitD.push(`M${pts.map((p) => p.join(' ')).join('L')}`);
        for (const [p, q] of [[v(d.arc.start), pts[0]], [v(d.arc.end), pts[pts.length - 1]]] as const) {
          const P = project(p);
          if (P && !d.arc.closed) line(P, q, 0.9);
        }
        tick(pts[0], Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]));
        tick(pts[pts.length - 1], Math.atan2(pts[pts.length - 1][1] - pts[pts.length - 2][1], pts[pts.length - 1][0] - pts[pts.length - 2][0]));
        const mid = pts[Math.floor(pts.length / 2)], m2 = pts[Math.floor(pts.length / 2) + 1] ?? mid;
        label(mid, Math.atan2(m2[1] - mid[1], m2[0] - mid[0]), [dimensionLabel(d, vals[0]), ...(d.text?.below ? [d.text.below] : [])]);
        grip(mid);
      } else {
        const onArc = c.clone().addScaledVector(toward, r);
        const far = d.kind === 'diameter' ? c.clone().addScaledVector(toward, -r) : c;
        const out = v(d.at).sub(c).length() > r ? v(d.at) : onArc;
        const C = project(far), Q = project(onArc), O = project(out);
        if (!C || !Q || !O) continue;
        line(C, Q);
        if (O !== Q) line(Q, O);
        arrow(Q, C);
        if (d.kind === 'diameter') arrow(C, Q);
        else el(g, 'circle', { cx: C[0], cy: C[1], r: 2.2, fill: color });
        const tip = O;
        const ang = Math.atan2(Q[1] - C[1], Q[0] - C[0]);
        label(out === onArc ? [(C[0] + Q[0]) / 2, (C[1] + Q[1]) / 2] : tip, ang, [dimensionLabel(d, vals[0]), ...(d.text?.below ? [d.text.below] : [])]);
        grip(O);
      }
    } else if (d.kind === 'spotElevation' || d.kind === 'spotCoordinate') {
      const P = project(v(d.points[0])), A = project(v(d.at));
      if (!P || !A) continue;
      // Target (elevation) or cross (coordinate) at the point, leader to a shoulder, text on the shoulder.
      if (d.kind === 'spotElevation') {
        el(g, 'circle', { cx: P[0], cy: P[1], r: 5, fill: 'none', stroke: color, 'stroke-width': 1.2 });
        el(g, 'path', { d: `M${P[0]} ${P[1]}h5a5 5 0 0 0 -5 -5zM${P[0]} ${P[1]}h-5a5 5 0 0 0 5 5z`, fill: color, stroke: 'none' });
      } else {
        line([P[0] - 6, P[1]], [P[0] + 6, P[1]], 1.2);
        line([P[0], P[1] - 6], [P[0], P[1] + 6], 1.2);
      }
      const right = A[0] >= P[0];
      const shoulder: [number, number] = [A[0] + (right ? 1 : -1) * 18, A[1]];
      const dx = A[0] - P[0], dy = A[1] - P[1], l = Math.hypot(dx, dy);
      if (l > 7) line([P[0] + (dx / l) * 6, P[1] + (dy / l) * 6], A);
      line(A, shoulder);
      const texts = vals.map((x, i) => (i === 0 ? dimensionLabel(d, x) : x));
      if (d.text?.below) texts.push(d.text.below);
      const w = Math.max(...texts.map((s) => s.length)) * 7 + 8;
      const tx = right ? shoulder[0] + w / 2 + 2 : shoulder[0] - w / 2 - 2;
      const h = texts.length * 14 + 2;
      el(g, 'rect', { x: tx - w / 2, y: shoulder[1] - h / 2, width: w, height: h, rx: 2, fill: style.plate, 'fill-opacity': 0.82 });
      texts.forEach((s, i) => {
        const t = el(g, 'text', { x: tx, y: shoulder[1] - h / 2 + 8 + i * 14, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: on ? style.hot : style.text, 'font-size': 11.5, 'font-weight': 600, 'font-family': style.font });
        t.textContent = s;
      });
      grip(A);
    } else if (d.kind === 'spotSlope') {
      const s = d.slope ? slopeOf(v(d.slope)) : null;
      const p = v(d.at);
      const P = project(p);
      if (!P) continue;
      const dir = s ? s.downhill : v(d.dir ?? [1, 0, 0]);
      const Q0 = project(p.clone().add(dir));
      let ang = Q0 ? Math.atan2(Q0[1] - P[1], Q0[0] - P[0]) : 0;
      if (!s || s.ratio < 1e-5 || !Q0 || Math.hypot(Q0[0] - P[0], Q0[1] - P[1]) < 1e-3) ang = 0;
      const L = 46;
      const A: [number, number] = [P[0] - (Math.cos(ang) * L) / 2, P[1] - (Math.sin(ang) * L) / 2];
      const B: [number, number] = [P[0] + (Math.cos(ang) * L) / 2, P[1] + (Math.sin(ang) * L) / 2];
      line(A, B, 1.2);
      if (s && s.ratio >= 1e-5) arrow(B, A);
      label(P, ang, [dimensionLabel(d, vals[0]), ...(d.text?.below ? [d.text.below] : [])], 9);
      grip(P);
    }
    // A wide invisible stroke makes the thin lines easy to click.
    // Under everything else in the group, so the grip stays on top and takes the drag.
    if (hitD.length && state.interactive) g.insertBefore(el(g, 'path', { d: hitD.join(''), fill: 'none', stroke: 'transparent', 'stroke-width': 10, 'pointer-events': 'stroke' }), g.firstChild);
  }
}
