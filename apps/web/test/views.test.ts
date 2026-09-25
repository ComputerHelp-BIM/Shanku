import { describe, expect, it } from 'vitest';
import { defaultViews, duplicateView, editSection, levelHeights, normalizeView, sectionFromVerticalView, validRange, viewClip, viewDirection } from '../src/lib/views';

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

describe('section grips (Revit)', () => {
  const s = { a: [0, 5] as [number, number], b: [10, 5] as [number, number], depth: 4 }; // looks north (−z)
  it('ends slide along the line and keep a minimum length', () => {
    expect(editSection(s, 'b', [0, 0, 0], [13, 0, 9])).toEqual({ ...s, b: [13, 5] }); // off-line pointer: projected
    expect(editSection(s, 'a', [0, 0, 0], [20, 0, 5]).a).toEqual([9.8, 5]); // cannot pass the other end
  });
  it('far clip follows the pointer on the viewing side', () => {
    expect(editSection(s, 'far', [0, 0, 0], [3, 0, -2]).depth).toBeCloseTo(7); // 7 m north of the line
    expect(editSection(s, 'far', [0, 0, 0], [3, 0, 9]).depth).toBe(0.1); // behind the line: minimum
  });
  it('move translates; flip reverses the direction', () => {
    expect(editSection(s, 'move', [1, 0, 1], [3, 0, 0])).toEqual({ a: [2, 4], b: [12, 4], depth: 4 });
    const f = editSection(s, 'flip', [0, 0, 0], [0, 0, 0]);
    expect(f.a).toEqual([10, 5]);
    expect(f.b).toEqual([0, 5]);
  });
});

describe('level heights and the file origin shift', () => {
  it('recognises declared elevations and labels model heights, whatever web-ifc shifted', async () => {
    const { levelHeights, originY } = await import('../src/lib/views');
    const { marksFor } = await import('../src/lib/viewMarks');
    // web-ifc moved this file down 2.35 m: a slab top at model +3.000 m sits at viewer +0.650 m
    const coord = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -2.35, 0, 1];
    const dy = originY(coord);
    const el = (level: string, cat: string, bot: number, top: number) => ({ level, category: cat, bounds: [0, bot + dy, 0, 1, top + dy, 1] as [number, number, number, number, number, number] });
    const h = levelHeights([{ name: 'Level 2', elevation: 3000 }], [el('Level 2', 'Column', 0, 3), el('Level 2', 'Slab', 2.875, 3)], 'mm', dy);
    expect(h.get('Level 2')).toBeCloseTo(0.65); // the declared +3000, confirmed by the slab top
    const view = { id: 'elev:N', kind: 'elevation', name: 'North', direction: [0, 0, -1] } as never;
    const marks = marksFor(view, [view], h, { min: [0, 0, 0], max: [1, 1, 1] }, dy);
    expect(marks.find((m) => m.kind === 'level')?.value).toBe('+3,000');
  });
});
