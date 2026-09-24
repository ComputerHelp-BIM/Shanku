/**
 * Which view symbols a view shows, as in Revit:
 * - plans: every section as a section mark, and the four elevation marks around the building;
 * - elevations and sections: every level as a level line with its head, and the sections that cut
 *   across the view as vertical section lines.
 * 3D views show none.
 */
import type { Annotation } from '@shanku/engine';
import { viewDirection, type ModelView } from './views';

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

const sectionLook = (s: NonNullable<ModelView['section']>): [number, number, number] => {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
  const len = Math.hypot(dx, dz) || 1;
  return [dz / len, 0, -dx / len];
};

export function marksFor(active: ModelView | null, views: readonly ModelView[], heights: Map<string, number>, box: Box): Annotation[] {
  if (!active || active.kind === '3d' || !Number.isFinite(box.min[0])) return [];
  const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2;
  const hx = (box.max[0] - box.min[0]) / 2, hz = (box.max[2] - box.min[2]) / 2;
  const margin = Math.max(2, 0.12 * Math.max(hx, hz) * 2);
  const out: Annotation[] = [];

  if (active.kind === 'plan') {
    const y = active.level !== undefined ? heights.get(active.level) ?? 0 : 0;
    for (const v of views) {
      if (v.kind === 'section' && v.section) {
        out.push({ kind: 'section', id: v.id, name: v.name, a: [v.section.a[0], y, v.section.a[1]], b: [v.section.b[0], y, v.section.b[1]], look: sectionLook(v.section) });
      } else if (v.kind === 'elevation' && v.direction) {
        const d = v.direction; // model → camera, horizontal
        const reach = Math.abs(d[0]) > Math.abs(d[2]) ? hx : hz;
        out.push({ kind: 'elevation', id: v.id, name: v.name, at: [cx + d[0] * (reach + margin), y, cz + d[2] * (reach + margin)], look: [-d[0], 0, -d[2]] });
      }
    }
    return out;
  }

  // Elevation or section: level lines across the view, head on the screen's right.
  const dir = viewDirection(active);
  if (!dir) return out;
  const f = [-dir[0], -dir[2]]; // looking direction, horizontal
  const fl = Math.hypot(f[0], f[1]) || 1;
  const right = [-f[1] / fl, f[0] / fl];
  const reach = Math.abs(right[0]) * hx + Math.abs(right[1]) * hz + margin * 0.5;
  const mid = active.kind === 'section' && active.section ? [(active.section.a[0] + active.section.b[0]) / 2, (active.section.a[1] + active.section.b[1]) / 2] : [cx, cz];
  for (const [name, h] of heights) {
    out.push({
      kind: 'level',
      id: `plan:${name}`,
      name,
      value: `${h >= 0 ? '+' : '−'}${Math.round(Math.abs(h) * 1000).toLocaleString('en-IN')}`,
      a: [mid[0] - right[0] * reach, h, mid[1] - right[1] * reach],
      b: [mid[0] + right[0] * reach, h, mid[1] + right[1] * reach],
    });
  }
  // Sections cutting across this view appear as vertical lines (head at the top).
  for (const v of views) {
    if (v.kind !== 'section' || !v.section || v.id === active.id) continue;
    const n = sectionLook(v.section);
    if (Math.abs(n[0] * f[0] + n[2] * f[1]) / fl > 0.2) continue; // not across this view
    const m = [(v.section.a[0] + v.section.b[0]) / 2, (v.section.a[1] + v.section.b[1]) / 2];
    out.push({ kind: 'section', id: v.id, name: v.name, a: [m[0], box.max[1] + 1, m[1]], b: [m[0], box.min[1] - 1, m[1]], look: n });
  }
  return out;
}
