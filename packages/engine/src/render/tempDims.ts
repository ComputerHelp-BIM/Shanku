/**
 * Temporary dimensions for a 2D selection, like Revit / AutoCAD. Works on straight segments in drawing
 * units: the selected object's own sizes, and the distance from each of its straight edges to the
 * nearest parallel line of another object (Revit's temporary dimensions to nearby references).
 */
export interface Dim2 {
  /** Measured points (drawing units). */
  a: [number, number];
  b: [number, number];
  /** Unit direction to push the dimension line away from the geometry. */
  offset: [number, number];
  value: number;
  kind: 'size' | 'clear';
}

type Seg = [number, number, number, number];

const len = (s: Seg) => Math.hypot(s[2] - s[0], s[3] - s[1]);
const unit = (s: Seg): [number, number] => {
  const l = len(s) || 1;
  return [(s[2] - s[0]) / l, (s[3] - s[1]) / l];
};
const parallel = (u: [number, number], v: [number, number]) => Math.abs(u[0] * v[1] - u[1] * v[0]) < 1e-3;

/** Merges collinear pieces so a rectangle is 4 sides even if drawn as more segments. */
function straightSides(segs: Seg[]): Seg[] {
  return segs.filter((s) => len(s) > 1e-6);
}

export function tempDims(selected: Seg[][], others: (visit: (s: Seg) => void) => void, maxNeighbour: number): Dim2[] {
  const out: Dim2[] = [];
  // Two single straight objects that are parallel: the distance between them.
  if (selected.length === 2 && selected[0].length === 1 && selected[1].length === 1) {
    const [s, t] = [selected[0][0], selected[1][0]];
    const u = unit(s);
    if (parallel(u, unit(t))) {
      const n: [number, number] = [-u[1], u[0]];
      const d = (t[0] - s[0]) * n[0] + (t[1] - s[1]) * n[1];
      const mid: [number, number] = [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2];
      out.push({ a: mid, b: [mid[0] + n[0] * d, mid[1] + n[1] * d], offset: u, value: Math.abs(d), kind: 'clear' });
      return out;
    }
  }
  if (selected.length !== 1) return out;
  const segs = straightSides(selected[0]);
  if (!segs.length || segs.length > 64) return out; // curves and hatches: no temporary dimensions

  // Own sizes: a single line -> its length; a closed 4-sided outline -> two adjacent sides.
  if (segs.length === 1) {
    const s = segs[0], u = unit(s);
    out.push({ a: [s[0], s[1]], b: [s[2], s[3]], offset: [-u[1], u[0]], value: len(s), kind: 'size' });
  } else if (segs.length === 4) {
    const cx = segs.reduce((a, s) => a + s[0], 0) / 4, cy = segs.reduce((a, s) => a + s[1], 0) / 4;
    for (const s of [segs[0], segs[1]]) {
      const u = unit(s);
      let n: [number, number] = [-u[1], u[0]];
      const mx = (s[0] + s[2]) / 2 - cx, my = (s[1] + s[3]) / 2 - cy;
      if (mx * n[0] + my * n[1] < 0) n = [-n[0], -n[1]]; // push outwards
      out.push({ a: [s[0], s[1]], b: [s[2], s[3]], offset: n, value: len(s), kind: 'size' });
    }
  }

  // Clear distances: for each long straight edge, the nearest parallel line outside, overlapping in extent.
  const edges = [...segs].sort((p, q) => len(q) - len(p)).slice(0, 4);
  const cx = segs.reduce((a, s) => a + s[0] + s[2], 0) / (2 * segs.length), cy = segs.reduce((a, s) => a + s[1] + s[3], 0) / (2 * segs.length);
  for (const e of edges) {
    const u = unit(e);
    let n: [number, number] = [-u[1], u[0]];
    const mx = (e[0] + e[2]) / 2 - cx, my = (e[1] + e[3]) / 2 - cy;
    if (segs.length > 1 && mx * n[0] + my * n[1] < 0) n = [-n[0], -n[1]];
    const t0 = e[0] * u[0] + e[1] * u[1], t1 = e[2] * u[0] + e[3] * u[1];
    const lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    const base = e[0] * n[0] + e[1] * n[1];
    let best = maxNeighbour;
    let at = 0;
    others((s) => {
      if (!parallel(u, unit(s))) return;
      const d = s[0] * n[0] + s[1] * n[1] - base;
      if (d <= 1e-6 || d >= best) return;
      const a0 = s[0] * u[0] + s[1] * u[1], a1 = s[2] * u[0] + s[3] * u[1];
      const olo = Math.max(lo, Math.min(a0, a1)), ohi = Math.min(hi, Math.max(a0, a1));
      if (ohi - olo <= 1e-6) return;
      best = d;
      at = (olo + ohi) / 2;
    });
    if (best < maxNeighbour) {
      const p: [number, number] = [u[0] * at + n[0] * base, u[1] * at + n[1] * base];
      out.push({ a: p, b: [p[0] + n[0] * best, p[1] + n[1] * best], offset: u, value: best, kind: 'clear' });
    }
  }
  return out;
}
