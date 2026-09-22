import { describe, expect, it } from 'vitest';
import { buildBoq } from '../src/model/boq';
import { siFactor } from '../src/ifc/quantities';
import type { ElementRecord } from '../src/model/types';

const el = (i: number, level: string, category: ElementRecord['category'], grade: string, volume: number, extra: Partial<ElementRecord> = {}): ElementRecord => ({
  index: i, expressId: 100 + i, globalId: `g${i}`, ifcClass: 'IfcX', category, name: '', tag: '', typeName: '', level,
  mark: '', markSource: '', grade, gradeSource: '', volume, area: null, length: null, quantitySource: 'ifc',
  bounds: [0, 0, 0, 1, 1, 1], ...extra,
});
const levels = [
  { name: 'Level 1', elevation: 0, elementCount: 0 },
  { name: 'Level 2', elevation: 3000, elementCount: 0 },
];

describe('BOQ', () => {
  const els = [
    el(0, 'Level 2', 'Beam', 'M30', 0.5, { length: 5 }),
    el(1, 'Level 1', 'Column', 'M40', 0.4, { length: 3 }),
    el(2, 'Level 1', 'Column', 'M40', 0.4, { length: 3, quantitySource: 'geometry' }),
    el(3, 'Level 1', 'Slab', 'M30', 2.0, { area: 13.3 }),
    el(4, 'Level 1', 'Footing', 'M25', 1.0),
  ];

  it('groups by level, category and grade, ordered by elevation and category', () => {
    const b = buildBoq(els, levels, ['level', 'category', 'grade']);
    expect(b.rows.map((r) => `${r.level}|${r.category}|${r.grade}|${r.count}`)).toEqual([
      'Level 1|Footing|M25|1',
      'Level 1|Column|M40|2',
      'Level 1|Slab|M30|1',
      'Level 2|Beam|M30|1',
    ]);
    const col = b.rows[1];
    expect(col.volume).toBeCloseTo(0.8);
    expect(col.length).toBe(6);
    expect(col.fromGeometry).toBe(1);
    expect(col.elements).toEqual([1, 2]);
    expect(b.total.volume).toBeCloseTo(4.3);
  });

  it('collapses dimensions that are not grouped', () => {
    const b = buildBoq(els, levels, ['grade']);
    expect(b.rows.map((r) => [r.grade, r.count, Number(r.volume.toFixed(2))])).toEqual([
      ['M25', 1, 1],
      ['M30', 2, 2.5],
      ['M40', 2, 0.8],
    ]);
  });

  it('converts units to SI', () => {
    expect(siFactor('mm')).toBe(0.001);
    expect(siFactor('mm²')).toBeCloseTo(1e-6);
    expect(siFactor('m³')).toBe(1);
  });
});
