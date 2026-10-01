/**
 * Picking helpers shared by the drawing and Modify tools (docs/design/datums-and-constraints.md): angle
 * snapping as Revit's (a direction close to 0°, 45°, 90°… locks to it; with Constrain or Shift only 0° and
 * 90°), and snapping to datum lines (grids, reference planes) and their intersections. Plan coordinates.
 */
export type P2 = [number, number];

/**
 * The direction from a start point to the cursor, snapped: within `tolerance` degrees of a multiple of
 * `step` it locks to it; `ortho` forces the nearest of 0°/90°/180°/270°. Returns the snapped end point and
 * whether it locked.
 */
export function snapDirection(start: P2, cursor: P2, opts: { ortho?: boolean; step?: number; tolerance?: number } = {}): { end: P2; locked: boolean; angle: number } {
  const dx = cursor[0] - start[0], dy = cursor[1] - start[1];
  const len = Math.hypot(dx, dy);
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (len < 1e-9) return { end: cursor, locked: false, angle: 0 };
  const step = opts.ortho ? 90 : (opts.step ?? 45);
  const nearest = Math.round(raw / step) * step;
  const off = Math.abs(((raw - nearest + 540) % 360) - 180);
  if (!opts.ortho && off > (opts.tolerance ?? 3)) return { end: cursor, locked: false, angle: raw };
  // ortho keeps the length along the locked axis (the cursor's projection), as Revit's Constrain does
  const t = (nearest * Math.PI) / 180;
  const along = opts.ortho ? dx * Math.cos(t) + dy * Math.sin(t) : len;
  return { end: [start[0] + Math.cos(t) * along, start[1] + Math.sin(t) * along], locked: true, angle: ((nearest % 360) + 360) % 360 };
}

export interface DatumLine {
  name: string;
  a: P2;
  b: P2;
}

const closestOn = (p: P2, a: P2, b: P2): P2 => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  // datums extend infinitely for snapping, as Revit's grids do
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  return [a[0] + t * dx, a[1] + t * dy];
};
function intersect(l: DatumLine, m: DatumLine): P2 | null {
  const d1: P2 = [l.b[0] - l.a[0], l.b[1] - l.a[1]], d2: P2 = [m.b[0] - m.a[0], m.b[1] - m.a[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((m.a[0] - l.a[0]) * d2[1] - (m.a[1] - l.a[1]) * d2[0]) / den;
  return [l.a[0] + t * d1[0], l.a[1] + t * d1[1]];
}

/**
 * The datum snap near a point (plan coordinates; `radius` in the same units): an intersection of two datums
 * first, else the nearest point on one. Null when none is within reach.
 */
export function snapToDatums(p: P2, lines: readonly DatumLine[], radius: number): { at: P2; kind: 'intersection' | 'datum'; label: string } | null {
  let best: { at: P2; kind: 'intersection' | 'datum'; label: string; d: number } | null = null;
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const x = intersect(lines[i], lines[j]);
      if (!x) continue;
      const d = Math.hypot(x[0] - p[0], x[1] - p[1]);
      if (d <= radius && (!best || best.kind !== 'intersection' || d < best.d)) best = { at: x, kind: 'intersection', label: `Intersection ${lines[i].name} / ${lines[j].name}`, d };
    }
  if (best) return best;
  for (const l of lines) {
    const c = closestOn(p, l.a, l.b);
    const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
    if (d <= radius && (!best || d < best.d)) best = { at: c, kind: 'datum', label: l.name, d };
  }
  return best;
}

/** The next datum name after the last one, as Revit numbers grids: 1 → 2, A → B, Z → AA, B2 → B3. */
export function nextDatumName(last: string | undefined, taken: readonly string[]): string {
  const bump = (s: string): string => {
    const num = /^(.*?)(\d+)$/.exec(s);
    if (num) return num[1] + String(Number(num[2]) + 1).padStart(num[2].length, '0');
    const let_ = /^(.*?)([A-Z]+)$/.exec(s);
    if (let_) {
      const chars = let_[2].split('');
      let i = chars.length - 1;
      while (i >= 0 && chars[i] === 'Z') chars[i--] = 'A';
      if (i < 0) chars.unshift('A');
      else chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return let_[1] + chars.join('');
    }
    return `${s}1`;
  };
  let name = last ? bump(last) : '1';
  while (taken.includes(name)) name = bump(name);
  return name;
}
