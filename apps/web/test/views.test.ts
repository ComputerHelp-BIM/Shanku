import { describe, expect, it } from 'vitest';
import { defaultViews, duplicateView, levelHeights, normalizeView, sectionFromVerticalView, validRange, viewClip, viewDirection } from '../src/lib/views';

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
    expect(plan.graphics.categories.Slab).toBeUndefined(); // no see-through slabs: hidden lines instead
    expect(plan.hiddenLines).toBe(true);
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

describe('view range and sections from 2D views', () => {
  it('offsets are relative to the level and may be negative (Revit View Range)', () => {
    const h = new Map([['L', 3]]);
    const v = { ...defaultViews([{ name: 'L' }], h)[1], cutOffset: -0.2, depthOffset: -1.5 };
    const c = viewClip(v, h, { min: [0, 0, 0], max: [10, 10, 10] })!;
    expect(c.center[1] - c.half[1]).toBeCloseTo(1.5);
    expect(c.center[1] + c.half[1]).toBeCloseTo(2.8);
    expect(validRange(-0.2, -1.5)).toBe(true);
    expect(validRange(1.2, 1.5)).toBe(false); // depth above the cut
    expect(viewClip({ ...v, cutOffset: 0, depthOffset: 0 }, h, { min: [0, 0, 0], max: [10, 10, 10] })).toBeNull();
  });

  it('upgrades plans saved by 0.20.0 (positive depth, see-through slabs)', () => {
    const old = { id: 'plan:L', kind: 'plan' as const, name: 'L', level: 'L', cutOffset: 1.2, viewDepth: 1.2, graphics: { categories: { Slab: { transparency: 70 }, Beam: { halftone: true } }, elements: {}, filters: [], applied: [] }, displayStyle: 'shaded' as const, edges: true };
    const n = normalizeView(old);
    expect(n.depthOffset).toBe(-1.2);
    expect(n.viewDepth).toBeUndefined();
    expect(n.graphics.categories).toEqual({ Beam: { halftone: true } });
    expect(n.hiddenLines).toBe(true);
  });

  it('a section drawn upward in the North elevation looks to the screen right (east… west swap checked)', () => {
    // North elevation: camera on the north (−z) side looking south (+z); screen right is −x (west).
    const s = sectionFromVerticalView([5, 0, 0], [5, 3, 0], [0, 0, -1], 10);
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    expect(Math.abs(dx)).toBeLessThan(1e-9); // the line runs north-south (the view depth)
    const n = [dz / 10, -dx / 10]; // our section viewing direction
    expect(n[0]).toBeCloseTo(-1); // looks west = screen right from the north
  });
});
