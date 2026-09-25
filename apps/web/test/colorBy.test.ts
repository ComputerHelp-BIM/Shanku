import { describe, expect, it } from 'vitest';
import type { ElementRecord } from '@shanku/engine';
import { computeColors, mergeOverrides, ramp, DEFAULT_COLOR_SETTINGS } from '../src/lib/colorBy';

const el = (index: number, extra: Partial<ElementRecord>): ElementRecord =>
  ({ index, category: 'Column', grade: 'M30', level: 'L1', typeName: 'C-400', mark: 'C1', length: 3, volume: 0.5, dims: { length: null, width: 0.3, depth: 0.45, height: 3 }, bounds: [0, 0, 0, 1, 3, 1], ...extra }) as ElementRecord;
const els = [el(0, {}), el(1, { grade: 'M40' }), el(2, { grade: '' }), el(3, { grade: 'M30', level: 'L2', length: 9, volume: 2 })];
const levels = [{ name: 'L1', elevation: 0, elementCount: 3 }, { name: 'L2', elevation: 3000, elementCount: 1 }];
const s = (patch: object) => ({ ...DEFAULT_COLOR_SETTINGS, ...patch });

describe('colour by parameter', () => {
  it('groups by grade, most common first, "(no grade)" last and grey', () => {
    const r = computeColors(els, levels, s({ mode: 'grade' }));
    expect(r.groups.map((g) => [g.key, g.count])).toEqual([['M30', 2], ['M40', 1], ['(no grade)', 1]]);
    expect(r.groups[2].color).toBe('#a7aab1');
    expect(r.colors.size).toBe(4);
  });

  it('orders levels by elevation, keeps custom swatches and hides groups switched off', () => {
    const r = computeColors(els, levels, s({ mode: 'level', custom: { 'level|L2': '#ff0000' }, off: ['level|L1'] }));
    expect(r.groups.map((g) => g.key)).toEqual(['L1', 'L2']);
    expect(r.colors.get(3)).toEqual([255, 0, 0]);
    expect(r.hidden).toEqual([0, 1, 2]);
  });

  it('uses the design system category colours in the engineering palette', () => {
    const r = computeColors(els, levels, s({ mode: 'category' }), { Column: '#123456' });
    expect(r.groups[0].color).toBe('#123456');
  });

  it('gives gradients a range and a colour ramp', () => {
    const r = computeColors(els, levels, s({ mode: 'length' }));
    expect(r.range).toEqual({ min: 3, max: 9, unit: 'm' });
    expect(r.colors.get(3)).toEqual(ramp(1));
    expect(r.groups).toEqual([]);
  });

  it('does nothing in None, and lets Visibility/Graphics overrides win', () => {
    expect(computeColors(els, levels, s({ mode: 'none' })).colors.size).toBe(0);
    const merged = mergeOverrides(new Map([[0, [1, 2, 3]], [1, [4, 5, 6]]]), [{ index: 1, color: [9, 9, 9], transparency: 50, halftone: false }, { index: 2, color: null, transparency: 0, halftone: true }]);
    expect(merged.find((o) => o.index === 0)?.color).toEqual([1, 2, 3]);
    expect(merged.find((o) => o.index === 1)).toEqual({ index: 1, color: [9, 9, 9], transparency: 50, halftone: false });
    expect(merged.find((o) => o.index === 2)?.halftone).toBe(true);
  });
});
