import { Vector3 } from 'three';
import type { Category, EdgeBuffers, ElementRecord, MeshBuffers } from '../model/types';

/**
 * Measure and Tab-select geometry (Revit's Measure Between Two References, Measure Along an Element,
 * and Tab to cycle what is under the cursor). Pure functions over the model's merged buffers, so
 * they run (and are tested) without WebGL.
 *
 * Coordinates are the viewer's (metres, Y up, north = −Z). Results for people use Revit's axes:
 * X east, Y north, Z up (see `toRevitAxes`).
 */

export type Bounds = [number, number, number, number, number, number];

/** Triangles and feature edges grouped by element (compressed rows): element i owns tris[triStart[i]..triStart[i+1]). */
export interface GeometryIndex {
  triStart: Uint32Array;
  tris: Uint32Array;
  edgeStart: Uint32Array;
  edges: Uint32Array;
}

/** What the measure functions need to know about the model as it is drawn. */
export interface MeasureScene {
  mesh: MeshBuffers;
  edges: EdgeBuffers;
  index: GeometryIndex;
  elements: readonly ElementRecord[];
  hidden: ReadonlySet<number>;
  /** Exploded-view offset of an element (world m), or null when assembled. */
  offset: (i: number) => readonly [number, number, number] | null;
  /** Bounds where the element is drawn (exploded). */
  bounds: (i: number) => Bounds;
  /** Inside the section box / view range (true when there is none). */
  inside: (p: Vector3) => boolean;
}

export function buildGeometryIndex(mesh: MeshBuffers, edges: EdgeBuffers, elementCount: number): GeometryIndex {
  const group = (count: number, owner: (k: number) => number) => {
    const start = new Uint32Array(elementCount + 1);
    for (let k = 0; k < count; k++) {
      const e = owner(k);
      if (e >= 0 && e < elementCount) start[e + 1]++;
    }
    for (let i = 0; i < elementCount; i++) start[i + 1] += start[i];
    const out = new Uint32Array(start[elementCount]);
    const cursor = start.slice(0, elementCount);
    for (let k = 0; k < count; k++) {
      const e = owner(k);
      if (e >= 0 && e < elementCount) out[cursor[e]++] = k;
    }
    return { start, out };
  };
  const t = group(mesh.indices.length / 3, (k) => mesh.elementIds[mesh.indices[k * 3]]);
  const e = group(edges.positions.length / 6, (k) => edges.elementIds[k * 2]);
  return { triStart: t.start, tris: t.out, edgeStart: e.start, edges: e.out };
}

// ------------------------------------------------------------------ helpers

const EPS = 1e-9;

function vertex(mesh: MeshBuffers, v: number, off: readonly [number, number, number] | null, out = new Vector3()): Vector3 {
  const P = mesh.positions;
  out.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
  if (off) out.set(out.x + off[0], out.y + off[1], out.z + off[2]);
  return out;
}

function triVerts(s: MeasureScene, i: number, t: number): [Vector3, Vector3, Vector3] {
  const off = s.offset(i);
  const I = s.mesh.indices;
  return [vertex(s.mesh, I[t * 3], off), vertex(s.mesh, I[t * 3 + 1], off), vertex(s.mesh, I[t * 3 + 2], off)];
}

function edgeVerts(s: MeasureScene, i: number, k: number): [Vector3, Vector3] {
  const off = s.offset(i);
  const E = s.edges.positions;
  const a = new Vector3(E[k * 6], E[k * 6 + 1], E[k * 6 + 2]);
  const b = new Vector3(E[k * 6 + 3], E[k * 6 + 4], E[k * 6 + 5]);
  if (off) {
    a.set(a.x + off[0], a.y + off[1], a.z + off[2]);
    b.set(b.x + off[0], b.y + off[1], b.z + off[2]);
  }
  return [a, b];
}

/** Unique vertex positions of an element (drawn position). */
export function elementVertices(s: MeasureScene, i: number): Vector3[] {
  const seen = new Set<string>();
  const out: Vector3[] = [];
  const I = s.mesh.indices;
  const off = s.offset(i);
  for (let k = s.index.triStart[i]; k < s.index.triStart[i + 1]; k++) {
    const t = s.index.tris[k];
    for (let c = 0; c < 3; c++) {
      const v = vertex(s.mesh, I[t * 3 + c], off);
      const key = keyOf(v);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/** Position key at 0.01 mm: vertices duplicated for flat shading compare equal. */
const keyOf = (v: Vector3) => `${Math.round(v.x * 1e5)},${Math.round(v.y * 1e5)},${Math.round(v.z * 1e5)}`;

/** Ray against an axis-aligned box: entry distance, or null. `pad` grows the box (m). */
export function rayBox(o: Vector3, d: Vector3, b: Bounds, pad = 0): number | null {
  let t0 = -Infinity, t1 = Infinity;
  const O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    const lo = b[a] - pad, hi = b[a + 3] + pad;
    if (Math.abs(D[a]) < EPS) {
      if (O[a] < lo || O[a] > hi) return null;
      continue;
    }
    let ta = (lo - O[a]) / D[a], tb = (hi - O[a]) / D[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

/** Möller–Trumbore, both sides: distance along the ray, or null. */
export function rayTriangle(o: Vector3, d: Vector3, a: Vector3, b: Vector3, c: Vector3): number | null {
  const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
  const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
  const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const tx = o.x - a.x, ty = o.y - a.y, tz = o.z - a.z;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t;
}

const triNormal = (a: Vector3, b: Vector3, c: Vector3) => new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));

// ------------------------------------------------------------------ ray casting

export interface RayHit {
  index: number;
  /** Distance along the ray (the ray direction is unit length). */
  t: number;
  point: Vector3;
  /** Face normal, turned towards the viewer. */
  normal: Vector3;
  tri: number;
}

/** Elements whose (padded) box the ray passes through, nearest box first; hidden elements skipped. */
export function elementsOnRay(s: MeasureScene, o: Vector3, d: Vector3, pad = 0): Array<{ index: number; t: number }> {
  const out: Array<{ index: number; t: number }> = [];
  for (let i = 0; i < s.elements.length; i++) {
    if (s.hidden.has(i) || s.index.triStart[i] === s.index.triStart[i + 1]) continue;
    const t = rayBox(o, d, s.bounds(i), pad);
    if (t !== null) out.push({ index: i, t });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Nearest visible (not clipped) surface hit of one element, or null. */
export function hitElement(s: MeasureScene, i: number, o: Vector3, d: Vector3): RayHit | null {
  let best: RayHit | null = null;
  for (let k = s.index.triStart[i]; k < s.index.triStart[i + 1]; k++) {
    const t = s.index.tris[k];
    const [a, b, c] = triVerts(s, i, t);
    const dist = rayTriangle(o, d, a, b, c);
    if (dist === null || (best && dist >= best.t)) continue;
    const p = o.clone().addScaledVector(d, dist);
    if (!s.inside(p)) continue;
    const n = triNormal(a, b, c).normalize();
    if (n.dot(d) > 0) n.negate();
    best = { index: i, t: dist, point: p, normal: n, tri: t };
  }
  return best;
}

/**
 * Every element under the ray, front to back (one hit each): Tab cycles through these. The ray
 * starts behind the camera (orthographic), so hits at any distance count.
 */
export function raycastAll(s: MeasureScene, o: Vector3, d: Vector3, candidates?: Array<{ index: number }>): RayHit[] {
  const hits: RayHit[] = [];
  for (const { index } of candidates ?? elementsOnRay(s, o, d)) {
    const h = hitElement(s, index, o, d);
    if (h) hits.push(h);
  }
  return hits.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ faces

export interface PlanarFace {
  index: number;
  normal: Vector3;
  /** A point on the face's plane. */
  point: Vector3;
  /** m² and m. */
  area: number;
  perimeter: number;
  centroid: Vector3;
  /** Boundary edges (drawn position). */
  outline: Array<[Vector3, Vector3]>;
}

/**
 * The flat face a triangle belongs to: the element's coplanar triangles connected to it by shared
 * edges (a slab top, a column side), with its area, perimeter, centre and outline.
 */
export function planarFace(s: MeasureScene, i: number, tri: number): PlanarFace {
  const [a0, b0, c0] = triVerts(s, i, tri);
  const n0 = triNormal(a0, b0, c0).normalize();
  const d0 = n0.dot(a0);
  // Coplanar triangles of the element, with their vertex keys.
  const cand: Array<{ t: number; v: [Vector3, Vector3, Vector3]; k: [string, string, string] }> = [];
  for (let k = s.index.triStart[i]; k < s.index.triStart[i + 1]; k++) {
    const t = s.index.tris[k];
    const v = triVerts(s, i, t);
    const n = triNormal(v[0], v[1], v[2]);
    const len = n.length();
    if (len < 1e-12) continue;
    n.divideScalar(len);
    if (n.dot(n0) < 0.9999) continue;
    if (v.some((p) => Math.abs(n0.dot(p) - d0) > 1e-4)) continue;
    cand.push({ t, v, k: [keyOf(v[0]), keyOf(v[1]), keyOf(v[2])] });
  }
  // Connected through shared edges, starting from the picked triangle.
  const edgeKey = (p: string, q: string) => (p < q ? `${p}|${q}` : `${q}|${p}`);
  const byEdge = new Map<string, number[]>();
  cand.forEach((c, n) => {
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(c.k[e], c.k[(e + 1) % 3]);
      const list = byEdge.get(key);
      if (list) list.push(n);
      else byEdge.set(key, [n]);
    }
  });
  const startN = cand.findIndex((c) => c.t === tri);
  const inFace = new Set<number>(startN >= 0 ? [startN] : []);
  const queue = [...inFace];
  while (queue.length) {
    const n = queue.pop()!;
    const c = cand[n];
    for (let e = 0; e < 3; e++) {
      for (const m of byEdge.get(edgeKey(c.k[e], c.k[(e + 1) % 3])) ?? []) {
        if (!inFace.has(m)) {
          inFace.add(m);
          queue.push(m);
        }
      }
    }
  }
  let area = 0;
  const centroid = new Vector3();
  const edgeUse = new Map<string, { a: Vector3; b: Vector3; count: number }>();
  for (const n of inFace) {
    const { v, k } = cand[n];
    const ar = triNormal(v[0], v[1], v[2]).length() / 2;
    area += ar;
    centroid.addScaledVector(new Vector3().add(v[0]).add(v[1]).add(v[2]).divideScalar(3), ar);
    for (let e = 0; e < 3; e++) {
      const key = edgeKey(k[e], k[(e + 1) % 3]);
      const u = edgeUse.get(key);
      if (u) u.count++;
      else edgeUse.set(key, { a: v[e], b: v[(e + 1) % 3], count: 1 });
    }
  }
  if (area > 0) centroid.divideScalar(area);
  else centroid.copy(a0).add(b0).add(c0).divideScalar(3);
  const outline: Array<[Vector3, Vector3]> = [];
  let perimeter = 0;
  for (const u of edgeUse.values()) {
    if (u.count !== 1) continue;
    outline.push([u.a, u.b]);
    perimeter += u.a.distanceTo(u.b);
  }
  return { index: i, normal: n0, point: a0.clone(), area, perimeter, centroid, outline };
}

/** "Top face", "Bottom face (soffit)", "Side face facing NE", "Sloped face, 30° from level". */
export function faceOrientation(n: Vector3): string {
  if (n.y > 0.999) return 'Top face';
  if (n.y < -0.999) return 'Bottom face (soffit)';
  const deg = (Math.asin(Math.min(1, Math.abs(n.y))) * 180) / Math.PI;
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  // East = +X, north = −Z.
  const bearing = ((Math.atan2(n.x, -n.z) * 180) / Math.PI + 360) % 360;
  const dir = compass[Math.round(bearing / 45) % 8];
  if (deg < 1) return `Side face facing ${dir}`;
  return `Sloped face facing ${dir}, ${Math.round(90 - deg)}° from level`;
}

// ------------------------------------------------------------------ centrelines

export interface MemberAxis {
  a: Vector3;
  b: Vector3;
  /** Unit direction a → b. */
  dir: Vector3;
  length: number;
  /** Largest section size across the axis (m). */
  width: number;
  /** Size across the axis horizontally (m): a wall's or beam's thickness, used to judge joins. */
  thickness: number;
  /** Straight prism: the axis is exact; otherwise it is the best fit (sloped or tapered members). */
  exact: boolean;
}

const AXIS_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['Column', 'Pile', 'Beam', 'Member', 'Wall']);

/** Principal direction of points (power iteration on the covariance). */
function principal(pts: Vector3[], mean: Vector3, horizontal: boolean): Vector3 {
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) {
    const x = p.x - mean.x, y = horizontal ? 0 : p.y - mean.y, z = p.z - mean.z;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  // Start from the box's longest side so symmetric shapes converge to a sensible axis.
  let v = new Vector3(1, horizontal ? 0 : 0.01, 0.02);
  const ext = new Vector3();
  for (const p of pts) ext.max(new Vector3(Math.abs(p.x - mean.x), horizontal ? 0 : Math.abs(p.y - mean.y), Math.abs(p.z - mean.z)));
  if (ext.y >= ext.x && ext.y >= ext.z) v.set(0.02, 1, 0.01);
  else if (ext.z >= ext.x) v.set(0.01, horizontal ? 0 : 0.02, 1);
  for (let k = 0; k < 64; k++) {
    const nx = xx * v.x + xy * v.y + xz * v.z, ny = xy * v.x + yy * v.y + yz * v.z, nz = xz * v.x + yz * v.y + zz * v.z;
    const w = new Vector3(nx, ny, nz);
    const l = w.length();
    if (l < 1e-15) break;
    w.divideScalar(l);
    if (w.distanceToSquared(v) < 1e-14) {
      v = w;
      break;
    }
    v = w;
  }
  return v.normalize();
}

/**
 * The centreline of a column, pile, beam, brace or wall, worked out from its geometry (IFC exports
 * do not carry Revit's analytical lines): columns and piles are vertical unless clearly raked, walls
 * run horizontally at mid-thickness, beams follow their length (sloped beams too).
 */
export function memberAxis(s: MeasureScene, i: number): MemberAxis | null {
  const e = s.elements[i];
  if (!e || !AXIS_CATEGORIES.has(e.category)) return null;
  const pts = elementVertices(s, i);
  if (pts.length < 4) return null;
  const mean = pts.reduce((m, p) => m.add(p), new Vector3()).divideScalar(pts.length);
  const vertical = e.category === 'Column' || e.category === 'Pile';
  let dir = principal(pts, mean, e.category === 'Wall');
  if (vertical && Math.abs(dir.y) < Math.cos((25 * Math.PI) / 180)) dir = new Vector3(0, 1, 0);
  if (vertical && dir.y < 0) dir.negate();
  if (!vertical) {
    // Point beams and walls west → east (then south → north) so results read the same way each time.
    if (dir.x < -1e-6 || (Math.abs(dir.x) <= 1e-6 && dir.z > 0)) dir.negate();
  }
  let lo = Infinity, hi = -Infinity;
  const side = new Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(side, dir).normalize();
  let s0 = Infinity, s1 = -Infinity, u0 = Infinity, u1 = -Infinity;
  for (const p of pts) {
    const q = new Vector3().subVectors(p, mean);
    const t = q.dot(dir);
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
    const a = q.dot(side), b = q.dot(up);
    s0 = Math.min(s0, a); s1 = Math.max(s1, a);
    u0 = Math.min(u0, b); u1 = Math.max(u1, b);
  }
  const width = Math.max(s1 - s0, u1 - u0);
  const length = hi - lo;
  if (length < 1e-3) return null;
  // Centre of the section (not the vertex mean, which leans towards detailed ends).
  const centre = mean.clone().addScaledVector(side, (s0 + s1) / 2).addScaledVector(up, (u0 + u1) / 2);
  const a = centre.clone().addScaledVector(dir, lo);
  const b = centre.clone().addScaledVector(dir, hi);
  // Exact when the element is its box along the axis (a straight prism): 8 corners, or every vertex on the section outline.
  const axisAligned = [dir.x, dir.y, dir.z].some((c) => Math.abs(Math.abs(c) - 1) < 1e-6);
  return { a, b, dir, length, width, thickness: s1 - s0, exact: axisAligned || pts.length === 8 };
}

// ------------------------------------------------------------------ chains (Tab: connected elements)

/**
 * Elements joined end to end with the start element, like Revit's Tab on a wall chain: the same
 * category, an end of one centreline at an end of the next (corners included). Stacked walls and
 * elements that merely cross are not joined.
 */
export function connectedChain(s: MeasureScene, start: number, axisOf: (i: number) => MemberAxis | null, limit = 500): number[] {
  const first = s.elements[start];
  const a0 = first ? axisOf(start) : null;
  if (!first || !a0) return [start];
  const same: number[] = [];
  for (let i = 0; i < s.elements.length; i++) if (i !== start && !s.hidden.has(i) && s.elements[i].category === first.category) same.push(i);
  const seen = new Set<number>([start]);
  const queue = [start];
  const near = (b: Bounds, c: Bounds, pad: number) => b[0] - pad <= c[3] && b[3] + pad >= c[0] && b[1] - pad <= c[4] && b[4] + pad >= c[1] && b[2] - pad <= c[5] && b[5] + pad >= c[2];
  while (queue.length && seen.size < limit) {
    const i = queue.shift()!;
    const ai = axisOf(i);
    if (!ai) continue;
    const bi = s.bounds(i);
    for (const j of same) {
      if (seen.has(j)) continue;
      const bj = s.bounds(j);
      if (!near(bi, bj, 0.05)) continue;
      const aj = axisOf(j);
      if (!aj) continue;
      const tol = Math.max(ai.thickness, aj.thickness) + 0.05;
      const ends = [ai.a, ai.b];
      const hit = ends.some((p) => p.distanceTo(aj.a) <= tol || p.distanceTo(aj.b) <= tol);
      if (!hit) continue;
      // An end joined to an end: not a wall crossing the middle of another (both ends far from the other's ends).
      seen.add(j);
      queue.push(j);
    }
  }
  return [...seen];
}

// ------------------------------------------------------------------ distances

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5). */
export function closestOnTriangle(p: Vector3, a: Vector3, b: Vector3, c: Vector3): Vector3 {
  const ab = new Vector3().subVectors(b, a), ac = new Vector3().subVectors(c, a), ap = new Vector3().subVectors(p, a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return a.clone();
  const bp = new Vector3().subVectors(p, b);
  const d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return b.clone();
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return a.clone().addScaledVector(ab, d1 / (d1 - d3));
  const cp = new Vector3().subVectors(p, c);
  const d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return c.clone();
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return a.clone().addScaledVector(ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return b.clone().addScaledVector(new Vector3().subVectors(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  const denom = 1 / (va + vb + vc);
  return a.clone().addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom);
}

/** Closest points between segments p1q1 and p2q2 (Ericson 5.1.9). */
export function closestSegments(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3): { a: Vector3; b: Vector3; s: number; t: number } {
  const d1 = new Vector3().subVectors(q1, p1), d2 = new Vector3().subVectors(q2, p2), r = new Vector3().subVectors(p1, p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  if (a <= EPS && e <= EPS) return { a: p1.clone(), b: p2.clone(), s, t };
  if (a <= EPS) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = d1.dot(r);
    if (e <= EPS) s = Math.min(1, Math.max(0, -c / a));
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  return { a: p1.clone().addScaledVector(d1, s), b: p2.clone().addScaledVector(d2, t), s, t };
}

/** Is p inside element i's (closed) mesh? Ray parity along a skewed direction. */
export function insideElement(s: MeasureScene, i: number, p: Vector3): boolean {
  const b = s.bounds(i);
  if (p.x < b[0] - 1e-6 || p.x > b[3] + 1e-6 || p.y < b[1] - 1e-6 || p.y > b[4] + 1e-6 || p.z < b[2] - 1e-6 || p.z > b[5] + 1e-6) return false;
  const d = new Vector3(0.5773, 0.5774, 0.5775).normalize();
  const ts: number[] = [];
  for (let k = s.index.triStart[i]; k < s.index.triStart[i + 1]; k++) {
    const [a, bb, c] = triVerts(s, i, s.index.tris[k]);
    const t = rayTriangle(p, d, a, bb, c);
    if (t !== null && t > 1e-7) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  let n = 0;
  for (let k = 0; k < ts.length; k++) if (k === 0 || ts[k] - ts[k - 1] > 1e-7) n++; // a ray through a shared edge counts once
  return n % 2 === 1;
}

export interface ClearResult {
  /** m; 0 when the elements touch or overlap. */
  distance: number;
  a: Vector3;
  b: Vector3;
  overlapping: boolean;
}

/**
 * Clear distance between two elements: the shortest gap between their surfaces (vertex to face both
 * ways, and edge to edge), 0 when they touch or one passes into the other.
 */
export function clearDistance(s: MeasureScene, i: number, j: number): ClearResult {
  const vi = elementVertices(s, i), vj = elementVertices(s, j);
  // One inside the other (e.g. a beam end built into a column): overlapping, no gap.
  const within = vi.find((p) => insideElement(s, j, p)) ?? vj.find((p) => insideElement(s, i, p));
  if (within) return { distance: 0, a: within.clone(), b: within.clone(), overlapping: true };
  let best = Infinity;
  let pa = new Vector3(), pb = new Vector3();
  const tris = (k: number) => {
    const out: Array<[Vector3, Vector3, Vector3]> = [];
    for (let n = s.index.triStart[k]; n < s.index.triStart[k + 1]; n++) out.push(triVerts(s, k, s.index.tris[n]));
    return out;
  };
  const ti = tris(i), tj = tris(j);
  for (const p of vi) {
    for (const [a, b, c] of tj) {
      const q = closestOnTriangle(p, a, b, c);
      const d = p.distanceToSquared(q);
      if (d < best) {
        best = d;
        pa = p.clone();
        pb = q;
      }
    }
  }
  for (const p of vj) {
    for (const [a, b, c] of ti) {
      const q = closestOnTriangle(p, a, b, c);
      const d = p.distanceToSquared(q);
      if (d < best) {
        best = d;
        pa = q;
        pb = p.clone();
      }
    }
  }
  const edges = (k: number) => {
    const out: Array<[Vector3, Vector3]> = [];
    for (let n = s.index.edgeStart[k]; n < s.index.edgeStart[k + 1]; n++) out.push(edgeVerts(s, k, s.index.edges[n]));
    return out;
  };
  const ei = edges(i), ej = edges(j);
  for (const [p1, q1] of ei) {
    for (const [p2, q2] of ej) {
      const r = closestSegments(p1, q1, p2, q2);
      const d = r.a.distanceToSquared(r.b);
      if (d < best) {
        best = d;
        pa = r.a;
        pb = r.b;
      }
    }
  }
  const distance = Math.sqrt(best);
  return { distance: distance < 1e-4 ? 0 : distance, a: pa, b: pb, overlapping: false };
}

export interface AxisDistance {
  distance: number;
  a: Vector3;
  b: Vector3;
  parallel: boolean;
}

/**
 * Between two centrelines: parallel ones give the perpendicular (centre-to-centre) distance, taken
 * across where they overlap; others the closest points between the two segments.
 */
export function axisDistance(p: MemberAxis, q: MemberAxis): AxisDistance {
  const parallel = Math.abs(p.dir.dot(q.dir)) > Math.cos((0.5 * Math.PI) / 180);
  if (parallel) {
    const d = p.dir;
    const t0 = 0, t1 = p.length;
    const u0 = new Vector3().subVectors(q.a, p.a).dot(d), u1 = new Vector3().subVectors(q.b, p.a).dot(d);
    const lo = Math.max(t0, Math.min(u0, u1)), hi = Math.min(t1, Math.max(u0, u1));
    const t = lo <= hi ? (lo + hi) / 2 : (Math.abs(u0 - t1) < Math.abs(u0 - t0) ? t1 : t0);
    const a = p.a.clone().addScaledVector(d, t);
    // Foot of the perpendicular on q's infinite line.
    const b = q.a.clone().addScaledVector(q.dir, new Vector3().subVectors(a, q.a).dot(q.dir));
    return { distance: a.distanceTo(b), a, b, parallel: true };
  }
  const r = closestSegments(p.a, p.b, q.a, q.b);
  return { distance: r.a.distanceTo(r.b), a: r.a, b: r.b, parallel: false };
}

// ------------------------------------------------------------------ references and results

/** What a picked point refers to: Revit measures between references, not only points. */
export type Reference =
  | { kind: 'point' }
  | { kind: 'face'; normal: Vector3; point: Vector3 }
  | { kind: 'edge'; a: Vector3; b: Vector3 }
  | { kind: 'axis'; axis: MemberAxis };

export type SnapKind = 'endpoint' | 'midpoint' | 'centre' | 'axisEnd' | 'axisMid' | 'axis' | 'edge' | 'face';

export const SNAP_LABEL: Record<SnapKind, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  centre: 'Face centre',
  axisEnd: 'Centreline end',
  axisMid: 'Centreline midpoint',
  axis: 'Centreline',
  edge: 'Nearest on edge',
  face: 'Face',
};

const SNAP_PRIORITY: Record<SnapKind, number> = { endpoint: 0, centre: 1, axisEnd: 1, midpoint: 2, axisMid: 2, axis: 3, edge: 4, face: 5 };

export interface MeasurePick {
  point: Vector3;
  kind: SnapKind;
  ref: Reference;
  /** Element the point is on (null for none). */
  index: number | null;
}

/** Viewer (Y up, north −Z) to Revit axes (X east, Y north, Z up). */
export const toRevitAxes = (v: Vector3): [number, number, number] => [v.x, -v.z, v.y];

export interface DistanceResult {
  a: Vector3;
  b: Vector3;
  /** m: in the view plane in 2D views (as Revit measures in plans and sections), else true 3D. */
  total: number;
  /** Revit axes (east, north, up), m. */
  delta: [number, number, number];
  /** Measured in the view plane (plan, elevation or section). */
  planar: boolean;
  /** True 3D length (differs from `total` only in 2D views). */
  length3d: number;
  /** Perpendicular distance when the references allow one (parallel faces, centrelines, point to face). */
  perpendicular: { value: number; label: string; a: Vector3; b: Vector3 } | null;
}

const onPlane = (p: Vector3, n: Vector3, q: Vector3) => p.clone().addScaledVector(n, -n.dot(new Vector3().subVectors(p, q)));
const onLine = (p: Vector3, a: Vector3, d: Vector3) => a.clone().addScaledVector(d, new Vector3().subVectors(p, a).dot(d));

/** Perpendicular distance between two references, if they have one. */
export function perpendicularBetween(p: MeasurePick, q: MeasurePick): DistanceResult['perpendicular'] {
  const P = p.ref, Q = q.ref;
  if (P.kind === 'face' && Q.kind === 'face') {
    if (Math.abs(P.normal.dot(Q.normal)) < 0.9998) return null;
    const b = onPlane(p.point, Q.normal, Q.point);
    const value = p.point.distanceTo(b);
    return { value, label: value < 5e-4 ? 'Faces flush (in one plane)' : 'Between parallel faces', a: p.point.clone(), b };
  }
  if (P.kind === 'axis' && Q.kind === 'axis') {
    const r = axisDistance(P.axis, Q.axis);
    return { value: r.distance, label: r.parallel ? 'Centre to centre' : 'Closest between centrelines', a: r.a, b: r.b };
  }
  if (P.kind === 'edge' && Q.kind === 'edge') {
    const dp = new Vector3().subVectors(P.b, P.a).normalize(), dq = new Vector3().subVectors(Q.b, Q.a).normalize();
    if (Math.abs(dp.dot(dq)) < 0.9998) return null;
    const b = onLine(p.point, Q.a, dq);
    return { value: p.point.distanceTo(b), label: 'Between parallel edges', a: p.point.clone(), b };
  }
  const face = P.kind === 'face' ? { f: P, other: q } : Q.kind === 'face' ? { f: Q, other: p } : null;
  if (face && face.other.ref.kind !== 'axis') {
    const b = onPlane(face.other.point, face.f.normal, face.f.point);
    return { value: face.other.point.distanceTo(b), label: 'Point to face (perpendicular)', a: face.other.point.clone(), b };
  }
  const axis = P.kind === 'axis' ? { x: P.axis, other: q } : Q.kind === 'axis' ? { x: Q.axis, other: p } : null;
  if (axis) {
    const b = onLine(axis.other.point, axis.x.a, axis.x.dir);
    return { value: axis.other.point.distanceTo(b), label: 'Point to centreline', a: axis.other.point.clone(), b };
  }
  return null;
}

/**
 * Measure Between Two References. `viewDir` (2D views): measure in the view plane, the way Revit
 * measures in plans, elevations and sections.
 */
export function measureBetween(p: MeasurePick, q: MeasurePick, viewDir: Vector3 | null = null): DistanceResult {
  const v = new Vector3().subVectors(q.point, p.point);
  const length3d = v.length();
  const inPlane = viewDir ? v.clone().addScaledVector(viewDir, -v.dot(viewDir)) : v;
  let perp = perpendicularBetween(p, q);
  if (perp && viewDir) {
    const w = new Vector3().subVectors(perp.b, perp.a);
    perp = { ...perp, value: w.addScaledVector(viewDir, -w.dot(viewDir)).length() };
  }
  const total = inPlane.length();
  if (perp && Math.abs(perp.value - total) < 5e-4) perp = null; // the same number twice says nothing
  return { a: p.point.clone(), b: q.point.clone(), total, delta: toRevitAxes(inPlane), planar: !!viewDir, length3d, perpendicular: perp };
}

// ------------------------------------------------------------------ snapping

export interface SnapCandidate extends MeasurePick {
  label: string;
  /** Distance from the cursor on screen (px). */
  dist: number;
  /** For drawing: the edge or centreline the snap sits on. */
  on?: [Vector3, Vector3];
}

export interface SnapQuery {
  /** Ray (orthographic: from behind the camera along the view direction, unit length). */
  origin: Vector3;
  dir: Vector3;
  /** Cursor, in the same pixel space as `project`. */
  cursor: [number, number];
  project: (p: Vector3) => [number, number];
  /** Snap radius, px. */
  radius: number;
  /** World size of one pixel (m), to pad element boxes by the snap radius. */
  pixel: number;
  axisOf: (i: number) => MemberAxis | null;
  faceOf: (i: number, tri: number) => PlanarFace;
}

/**
 * What the cursor can snap to, best first (endpoint, face centre and centreline ends, midpoints,
 * centreline, nearest on edge, face): Tab steps through the list. Points hidden behind the surface
 * under the cursor, or cut away by the section box, are left out.
 */
export function snapCandidates(s: MeasureScene, q: SnapQuery): { candidates: SnapCandidate[]; hits: RayHit[] } {
  const pad = q.radius * q.pixel;
  const near = elementsOnRay(s, q.origin, q.dir, pad).slice(0, 40);
  const hits = raycastAll(s, q.origin, q.dir, near);
  const front = hits[0] ?? null;
  const limit = front ? front.t + pad + 0.002 : Infinity;
  const depth = (p: Vector3) => new Vector3().subVectors(p, q.origin).dot(q.dir);
  const out: SnapCandidate[] = [];
  const add = (c: Omit<SnapCandidate, 'label' | 'dist'>, dist: number) => {
    if (dist > q.radius) return;
    out.push({ ...c, label: SNAP_LABEL[c.kind], dist });
  };
  const sd = (p: Vector3) => {
    const s2 = q.project(p);
    return Math.hypot(s2[0] - q.cursor[0], s2[1] - q.cursor[1]);
  };
  const visible = (p: Vector3) => depth(p) <= limit && s.inside(p);
  for (const { index, t } of near) {
    if (t > limit) continue; // the whole element is behind what the cursor is on
    for (let n = s.index.edgeStart[index]; n < s.index.edgeStart[index + 1]; n++) {
      const [a, b] = edgeVerts(s, index, s.index.edges[n]);
      if (visible(a)) add({ point: a, kind: 'endpoint', ref: { kind: 'edge', a, b }, index }, sd(a));
      if (visible(b)) add({ point: b, kind: 'endpoint', ref: { kind: 'edge', a, b }, index }, sd(b));
      const m = a.clone().add(b).multiplyScalar(0.5);
      if (visible(m)) add({ point: m, kind: 'midpoint', ref: { kind: 'edge', a, b }, index, on: [a, b] }, sd(m));
      // Nearest point along the edge, on screen.
      const sa = q.project(a), sb = q.project(b);
      const ex = sb[0] - sa[0], ey = sb[1] - sa[1], l2 = ex * ex + ey * ey;
      if (l2 > 1) {
        const u = Math.min(1, Math.max(0, ((q.cursor[0] - sa[0]) * ex + (q.cursor[1] - sa[1]) * ey) / l2));
        const p = a.clone().lerp(b, u);
        if (visible(p)) add({ point: p, kind: 'edge', ref: { kind: 'edge', a, b }, index, on: [a, b] }, sd(p));
      }
    }
    // Centrelines run inside the element: offered when the element itself is what the cursor is on (or at its outline).
    const ax = q.axisOf(index);
    if (ax) {
      const ref: Reference = { kind: 'axis', axis: ax };
      const mid = ax.a.clone().add(ax.b).multiplyScalar(0.5);
      for (const [p, kind] of [[ax.a, 'axisEnd'], [ax.b, 'axisEnd'], [mid, 'axisMid']] as const) {
        if (s.inside(p)) add({ point: p.clone(), kind, ref, index, on: [ax.a, ax.b] }, sd(p));
      }
      const sa = q.project(ax.a), sb = q.project(ax.b);
      const ex = sb[0] - sa[0], ey = sb[1] - sa[1], l2 = ex * ex + ey * ey;
      if (l2 > 1) {
        const u = Math.min(1, Math.max(0, ((q.cursor[0] - sa[0]) * ex + (q.cursor[1] - sa[1]) * ey) / l2));
        const p = ax.a.clone().lerp(ax.b, u);
        if (s.inside(p)) add({ point: p, kind: 'axis', ref, index, on: [ax.a, ax.b] }, sd(p));
      }
    }
  }
  if (front) {
    const face = q.faceOf(front.index, front.tri);
    const ref: Reference = { kind: 'face', normal: face.normal, point: face.point };
    if (s.inside(face.centroid)) add({ point: face.centroid.clone(), kind: 'centre', ref, index: front.index }, sd(face.centroid));
    out.push({ point: front.point.clone(), kind: 'face', ref, index: front.index, label: SNAP_LABEL.face, dist: 0 });
  }
  out.sort((a, b) => SNAP_PRIORITY[a.kind] - SNAP_PRIORITY[b.kind] || a.dist - b.dist || depth(a.point) - depth(b.point));
  // One entry per kind and place (an endpoint is shared by three edges).
  const seen = new Set<string>();
  const unique = out.filter((c) => {
    const k = `${c.kind}:${keyOf(c.point)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { candidates: unique.slice(0, 12), hits };
}

/** Millimetres as Revit shows them in Indian practice: "4,500" (en-IN grouping). */
export const fmtMm = (m: number) => Math.round(m * 1000).toLocaleString('en-IN');
