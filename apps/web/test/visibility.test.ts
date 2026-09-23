import { describe, expect, it } from 'vitest';
import { countOverrides, hexToRgb, resolveGraphics } from '../src/lib/visibility';

const els = [
  { index: 0, category: 'Column' },
  { index: 1, category: 'Column' },
  { index: 2, category: 'Beam' },
  { index: 3, category: 'Slab' },
];

describe('Visibility/Graphics', () => {
  it('hides a category and colours another', () => {
    const r = resolveGraphics(els, { categories: { Column: { visible: false }, Beam: { color: '#FF8000', transparency: 40 } }, elements: {}, filters: [], applied: [] });
    expect(r.hidden).toEqual([0, 1]);
    expect(r.overrides).toEqual([{ index: 2, color: [255, 128, 0], transparency: 40, halftone: false }]);
  });

  it('element overrides win over their category (Revit By Element)', () => {
    const r = resolveGraphics(els, {
      categories: { Column: { visible: false, halftone: true } },
      elements: { 1: { visible: true, color: '#00FF00' } },
      filters: [],
      applied: [],
    });
    expect(r.hidden).toEqual([0]);
    expect(r.overrides).toEqual([{ index: 1, color: [0, 255, 0], transparency: 0, halftone: true }]);
  });

  it('an element can clear its category colour with null', () => {
    const r = resolveGraphics(els, { categories: { Beam: { color: '#123456', halftone: true } }, elements: { 2: { color: null } }, filters: [], applied: [] });
    expect(r.overrides[0].color).toBeNull();
    expect(r.overrides[0].halftone).toBe(true);
  });

  it('parses colours and counts overrides', () => {
    expect(hexToRgb('#0a0B0c')).toEqual([10, 11, 12]);
    expect(hexToRgb('red')).toBeNull();
    expect(countOverrides({ categories: { Beam: { visible: true }, Slab: { halftone: true } }, elements: { 3: { transparency: 20 } }, filters: [], applied: [] })).toBe(2);
  });
});

describe('view filters (Revit)', () => {
  const full = [
    { index: 0, category: 'Column', mark: 'C1', level: 'Level 1', typeName: 'C-400x400', name: 'C1', grade: 'M40', ifcClass: 'IfcColumn', volume: 0.49 },
    { index: 1, category: 'Column', mark: 'C2', level: 'Level 2', typeName: 'C-400x400', name: 'C2', grade: 'M40', ifcClass: 'IfcColumn', volume: 0.49 },
    { index: 2, category: 'Beam', mark: 'B1', level: 'Level 2', typeName: 'B-300x600', name: 'B1', grade: 'M30', ifcClass: 'IfcBeam', volume: 1.2 },
    { index: 3, category: 'Slab', mark: 'S1', level: 'Level 2', typeName: 'S-150', name: 'S1', grade: 'M30', ifcClass: 'IfcSlab', volume: 28.7 },
  ];
  const level2 = { id: 'a', name: 'Level 2', categories: [], combine: 'and' as const, rules: [{ param: 'Level' as const, op: 'equals' as const, value: 'level 2' }] };
  const bigPours = { id: 'b', name: 'Big pours', categories: ['Slab', 'Beam'], combine: 'and' as const, rules: [{ param: 'Volume (m³)' as const, op: 'greater than' as const, value: '1' }] };

  it('matches rules (case-insensitive text, numbers) and limits to categories', async () => {
    const { filterMatches } = await import('../src/lib/filters');
    expect(full.filter((e) => filterMatches(e, level2)).map((e) => e.index)).toEqual([1, 2, 3]);
    expect(full.filter((e) => filterMatches(e, bigPours)).map((e) => e.index)).toEqual([2, 3]);
  });

  it('the filter higher in the list wins; element overrides still win over filters; category is the fallback', () => {
    const r = resolveGraphics(full, {
      categories: { Column: { halftone: true } },
      elements: { 3: { color: '#000000' } },
      filters: [level2, bigPours],
      applied: [
        { filterId: 'b', enabled: true, override: { color: '#FF0000' } },
        { filterId: 'a', enabled: true, override: { color: '#00FF00' } },
      ],
    });
    const byIndex = Object.fromEntries(r.overrides.map((o) => [o.index, o]));
    expect(byIndex[0]).toMatchObject({ color: null, halftone: true }); // no filter: category halftone
    expect(byIndex[1]).toMatchObject({ color: [0, 255, 0], halftone: true }); // Level 2 filter colour, category halftone kept
    expect(byIndex[2].color).toEqual([255, 0, 0]); // both match: Big pours is higher
    expect(byIndex[3].color).toEqual([0, 0, 0]); // element override wins
  });

  it('a filter can hide, and disabled filters do nothing', () => {
    const hide = { filterId: 'a', enabled: true, override: { visible: false } };
    expect(resolveGraphics(full, { categories: {}, elements: {}, filters: [level2], applied: [hide] }).hidden).toEqual([1, 2, 3]);
    expect(resolveGraphics(full, { categories: {}, elements: {}, filters: [level2], applied: [{ ...hide, enabled: false }] }).hidden).toEqual([]);
  });
});
