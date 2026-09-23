import { describe, expect, it } from 'vitest';
import { defaultViews, duplicateView, levelHeights, viewClip, viewDirection } from '../src/lib/views';

const el = (category: string, level: string, y0: number, y1: number) => ({ category, level, bounds: [0, y0, 0, 1, y1, 1] });
const elements = [
  el('Column', 'Level 1', 0, 3), el('Column', 'Level 1', 0, 3), el('Slab', 'Level 1', -0.15, 0),
  el('Column', 'Level 2', 3, 6), el('Beam', 'Level 2', 2.4, 3),
  el('Slab', 'Roof', 5.85, 6),
  el('Footing', 'Foundation', -1.5, -0.9),
];
const levels = [{ name: 'Foundation' }, { name: 'Level 1' }, { name: 'Level 2' }, { name: 'Roof' }, { name: 'Empty' }];

describe('views (Revit project browser)', () => {
  it('reads level heights from the geometry: slab tops first, then beam tops, then column bases', () => {
    const h = levelHeights(levels, elements);
    expect([h.get('Level 1'), h.get('Level 2'), h.get('Roof'), h.get('Foundation')]).toEqual([0, 3, 6, -1.5]);
    expect(h.has('Empty')).toBe(false);
  });

  it('columns placed on the level above do not mislead it (sample-frame case)', () => {
    const upper = [el('Column', 'Level 2', 0, 3.05), el('Column', 'Level 2', 0, 3.05), el('Beam', 'Level 2', 2.55, 3.05), el('Slab', 'Level 2', 3.05, 3.2)];
    expect(levelHeights([{ name: 'Level 2' }], upper).get('Level 2')).toBe(3.2);
  });

  it('uses the storey elevation (converted) when the geometry agrees, else ignores it', () => {
    const e = [el('Slab', 'L', 2.85, 3), el('Beam', 'L', 2.4, 3)];
    expect(levelHeights([{ name: 'L', elevation: 3000 }], e, 'mm').get('L')).toBe(3);
    expect(levelHeights([{ name: 'L', elevation: 99999 }], e, 'mm').get('L')).toBe(3); // disagrees: geometry wins
  });

  it('creates {3D}, a plan per level with a height, and four elevations', () => {
    const v = defaultViews(levels, levelHeights(levels, elements));
    expect(v.map((x) => x.name)).toEqual(['{3D}', 'Foundation', 'Level 1', 'Level 2', 'Roof', 'North', 'East', 'South', 'West']);
  });

  it('plan view range: level - depth to level + cut; looks down', () => {
    const h = levelHeights(levels, elements);
    const plan = defaultViews(levels, h).find((x) => x.name === 'Level 2')!;
    const clip = viewClip(plan, h, { min: [0, -2, 0], max: [10, 7, 20] })!;
    expect(clip.center[1] - clip.half[1]).toBeCloseTo(1.8);
    expect(clip.center[1] + clip.half[1]).toBeCloseTo(4.2);
    expect(viewDirection(plan)).toEqual([0, 1, 0]);
    expect(plan.graphics.categories.Slab?.transparency).toBe(70); // floors see-through in structural plans
  });

  it('section: slice from the line to the far clip, camera behind the cut', () => {
    const s = { id: 's', kind: 'section' as const, name: 'Section 1', section: { a: [0, 5] as [number, number], b: [10, 5] as [number, number], depth: 4 }, graphics: { categories: {}, elements: {}, filters: [], applied: [] }, displayStyle: 'shaded' as const, edges: true };
    const clip = viewClip(s, new Map(), { min: [0, 0, 0], max: [10, 6, 10] })!;
    expect(clip.half[0]).toBeCloseTo(5);
    expect(clip.half[2]).toBeCloseTo(2);
    expect(clip.center[2]).toBeCloseTo(3); // line at z = 5 drawn left to right looks north (−z), depth 4
    expect(viewDirection(s)).toEqual([0, 0, 1]); // camera on the south (+z) side, behind the cut
  });

  it('duplicates with a Revit-style name', () => {
    const v = defaultViews(levels, levelHeights(levels, elements));
    const d = duplicateView(v[0], v);
    expect(d.name).toBe('{3D} Copy 1');
    expect(d.id).not.toBe(v[0].id);
  });
});
