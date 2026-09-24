import { describe, expect, it } from 'vitest';
import { defaultViews } from '../src/lib/views';
import { marksFor } from '../src/lib/viewMarks';

const heights = new Map([['Level 1', 0], ['Level 2', 3.2]]);
const box = { min: [0, -1, 0] as [number, number, number], max: [20, 4, 10] as [number, number, number] };
const views = [
  ...defaultViews([{ name: 'Level 1' }, { name: 'Level 2' }], heights),
  // a section drawn left to right along z = 5 (looks north), and one along x = 8 (looks west... across N/S elevations)
  { id: 'section:a', kind: 'section' as const, name: 'Section 1', section: { a: [0, 5] as [number, number], b: [20, 5] as [number, number], depth: 5 }, graphics: { categories: {}, elements: {}, filters: [], applied: [] }, displayStyle: 'shaded' as const, edges: true },
  { id: 'section:b', kind: 'section' as const, name: 'Section 2', section: { a: [8, 10] as [number, number], b: [8, 0] as [number, number], depth: 5 }, graphics: { categories: {}, elements: {}, filters: [], applied: [] }, displayStyle: 'shaded' as const, edges: true },
];

describe('view marks (Revit view symbols)', () => {
  it('plans show every section and the four elevation marks outside the building', () => {
    const plan = views.find((v) => v.id === 'plan:Level 2')!;
    const m = marksFor(plan, views, heights, box);
    expect(m.filter((a) => a.kind === 'section').map((a) => a.id)).toEqual(['section:a', 'section:b']);
    const north = m.find((a) => a.id === 'elev:North')!;
    if (north.kind !== 'elevation') throw new Error('expected an elevation mark');
    expect(north.at[2]).toBeLessThan(0); // north of the building (−z)
    expect(north.look).toEqual([-0, 0, 1]); // looks south, at the building
    expect(north.at[1]).toBe(3.2); // drawn at the plan's level
  });

  it('elevations show a level line per level, head on the right, value in mm', () => {
    const north = views.find((v) => v.id === 'elev:North')!;
    const levels = marksFor(north, views, heights, box).filter((a) => a.kind === 'level');
    expect(levels.map((l) => l.name)).toEqual(['Level 1', 'Level 2']);
    const l2 = levels[1];
    if (l2.kind !== 'level') throw new Error('expected a level');
    expect(l2.value).toBe('+3,200');
    expect(l2.id).toBe('plan:Level 2'); // double-click opens the level's plan
    expect(l2.a[1]).toBe(3.2);
  });

  it('elevations show only the sections that cut across them', () => {
    const north = views.find((v) => v.id === 'elev:North')!;
    const s = marksFor(north, views, heights, box).filter((a) => a.kind === 'section').map((a) => a.id);
    expect(s).toEqual(['section:b']); // section:a is parallel to the North elevation
  });

  it('3D views show no symbols', () => {
    expect(marksFor(views[0], views, heights, box)).toEqual([]);
  });
});
