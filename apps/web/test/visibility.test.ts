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
    const r = resolveGraphics(els, { categories: { Column: { visible: false }, Beam: { color: '#FF8000', transparency: 40 } }, elements: {} });
    expect(r.hidden).toEqual([0, 1]);
    expect(r.overrides).toEqual([{ index: 2, color: [255, 128, 0], transparency: 40, halftone: false }]);
  });

  it('element overrides win over their category (Revit By Element)', () => {
    const r = resolveGraphics(els, {
      categories: { Column: { visible: false, halftone: true } },
      elements: { 1: { visible: true, color: '#00FF00' } },
    });
    expect(r.hidden).toEqual([0]);
    expect(r.overrides).toEqual([{ index: 1, color: [0, 255, 0], transparency: 0, halftone: true }]);
  });

  it('an element can clear its category colour with null', () => {
    const r = resolveGraphics(els, { categories: { Beam: { color: '#123456', halftone: true } }, elements: { 2: { color: null } } });
    expect(r.overrides[0].color).toBeNull();
    expect(r.overrides[0].halftone).toBe(true);
  });

  it('parses colours and counts overrides', () => {
    expect(hexToRgb('#0a0B0c')).toEqual([10, 11, 12]);
    expect(hexToRgb('red')).toBeNull();
    expect(countOverrides({ categories: { Beam: { visible: true }, Slab: { halftone: true } }, elements: { 3: { transparency: 20 } } })).toBe(2);
  });
});
