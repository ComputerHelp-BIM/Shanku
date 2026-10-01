import { describe, expect, it } from 'vitest';
import { formatLength, parseLength, type DisplayUnits } from '../src/units';
import { nextDatumName, snapDirection, snapToDatums } from '../src/render/snapping';

const mm: DisplayUnits = { length: 'mm', decimals: 0, grouping: 'indian' };
const m: DisplayUnits = { length: 'm', decimals: 3, grouping: 'international' };
const ft: DisplayUnits = { length: 'ft-in', decimals: 1, grouping: 'international' };

describe('project units', () => {
  it('formats lengths as the project shows them', () => {
    expect(formatLength(101, { units: mm })).toBe('1,01,000');
    expect(formatLength(3.2, { units: mm, symbol: true })).toBe('3,200 mm');
    expect(formatLength(-2, { units: mm, signed: true })).toBe('−2,000');
    expect(formatLength(4.5, { units: mm, signed: true })).toBe('+4,500');
    expect(formatLength(0, { units: mm, signed: true })).toBe('0');
    expect(formatLength(1234.5678, { units: m })).toBe('1,234.568');
    expect(formatLength(3.2004, { units: { ...mm, length: 'cm', decimals: 1 } })).toBe('320.0');
    expect(formatLength(3.2004, { units: ft })).toBe(`10' - 6"`); // 10' 6.0" to the nearest ½"
    expect(formatLength(0.0127, { units: { ...ft, decimals: 4 } })).toBe(`0' - 0 1/2"`);
  });

  it('reads what people type, in the project unit unless they say otherwise', () => {
    expect(parseLength('+1,01,000', mm)).toBeCloseTo(101, 9);
    expect(parseLength('3.2m', mm)).toBeCloseTo(3.2, 9);
    expect(parseLength('−450', mm)).toBeCloseTo(-0.45, 9);
    expect(parseLength('3.2', m)).toBeCloseTo(3.2, 9);
    expect(parseLength('450 mm', m)).toBeCloseTo(0.45, 9);
    expect(parseLength(`10'6"`, mm)).toBeCloseTo(3.2004, 9);
    expect(parseLength(`10' - 6 1/2"`, mm)).toBeCloseTo((126.5 * 0.0254), 9);
    expect(parseLength('10', ft)).toBeCloseTo(3.048, 9); // a plain number in feet-inches is feet
    expect(parseLength('5x', mm)).toBeNaN();
    expect(parseLength('', mm)).toBeNaN();
  });
});

describe('picking helpers', () => {
  it('locks to 0°/45°/90° near them, and to orthogonal with Shift', () => {
    expect(snapDirection([0, 0], [1000, 30])).toMatchObject({ locked: true, angle: 0 }); // 1.7° off
    expect(snapDirection([0, 0], [1000, 30]).end[1]).toBeCloseTo(0, 9);
    expect(snapDirection([0, 0], [1000, 200]).locked).toBe(false); // 11° off
    expect(snapDirection([0, 0], [1000, 1020])).toMatchObject({ locked: true, angle: 45 });
    const o = snapDirection([0, 0], [1000, 200], { ortho: true });
    expect(o.end[0]).toBeCloseTo(1000, 9);
    expect(o.end[1]).toBeCloseTo(0, 9);
  });

  it('snaps to grid intersections first, then to a grid line', () => {
    const grids = [{ name: '1', a: [0, 0] as [number, number], b: [0, 10000] as [number, number] }, { name: 'A', a: [-5000, 6000] as [number, number], b: [5000, 6000] as [number, number] }];
    expect(snapToDatums([150, 5900], grids, 300)).toEqual({ at: [0, 6000], kind: 'intersection', label: 'Intersection 1 / A', d: expect.any(Number) });
    expect(snapToDatums([150, 2000], grids, 300)).toMatchObject({ at: [0, 2000], kind: 'datum', label: '1' });
    expect(snapToDatums([2000, 2000], grids, 300)).toBeNull();
  });

  it('names the next grid as Revit does', () => {
    expect(nextDatumName(undefined, [])).toBe('1');
    expect(nextDatumName('3', [])).toBe('4');
    expect(nextDatumName('A', [])).toBe('B');
    expect(nextDatumName('Z', [])).toBe('AA');
    expect(nextDatumName('B2', [])).toBe('B3');
    expect(nextDatumName('1', ['2'])).toBe('3');
  });
});
