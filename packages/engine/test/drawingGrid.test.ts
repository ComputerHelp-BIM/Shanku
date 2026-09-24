import { describe, expect, it } from 'vitest';
import { GRID_MIN_PX, gridLevels, gridValues } from '../src/render/drawingGrid';
import { indexEntities, objectTypeLabel, OBJECT_KIND } from '../src/dxf/entityIndex';

describe('adaptive drawing grid', () => {
  it('picks the finest power of ten at least the minimum spacing apart', () => {
    const [fine, mid, major] = gridLevels(0.02); // 0.02 px per unit: 400 units = 8 px
    expect(fine.step).toBe(1000);
    expect(mid.step).toBe(10000);
    expect(major.step).toBe(100000);
    expect(fine.step * 0.02).toBeGreaterThanOrEqual(GRID_MIN_PX);
  });

  it('fades the fine level in and strengthens the middle level smoothly', () => {
    const atMin = gridLevels(GRID_MIN_PX / 100); // fine lines exactly 8 px apart
    expect(atMin[0].opacity).toBeCloseTo(0);
    expect(atMin[1].mix).toBeCloseTo(0);
    const almostNext = gridLevels((GRID_MIN_PX * 9.99) / 100); // just before the switch to a finer decade
    expect(almostNext[0].opacity).toBeCloseTo(1, 2);
    expect(almostNext[1].mix).toBeCloseTo(1, 2);
  });

  it('keeps the same colours on both sides of a decade switch (no popping)', () => {
    const before = gridLevels((GRID_MIN_PX / 10) * 0.99999); // step 100, fine lines just under 80 px
    const after = gridLevels((GRID_MIN_PX / 10) * 1.00001); // step 10, fine lines just over 8 px
    // After the switch the old fine level (100) is the new middle level, with the same look.
    expect(after[1].step).toBe(before[0].step);
    expect(after[1].mix).toBeCloseTo(before[0].mix, 3);
    expect(after[1].opacity).toBeCloseTo(before[0].opacity, 3);
    expect(after[2].mix).toBeCloseTo(before[1].mix, 3);
  });

  it('returns nothing for a broken zoom', () => {
    expect(gridLevels(0)).toEqual([]);
    expect(gridLevels(Number.NaN)).toEqual([]);
    expect(gridLevels(Infinity)).toEqual([]);
  });

  it('lists positions in range and leaves coarser ones to the coarser level', () => {
    expect(gridValues(-25, 25, 10, false)).toEqual([-20, -10, 0, 10, 20]);
    expect(gridValues(0, 250, 10, true)).not.toContain(100);
    expect(gridValues(0, 250, 10, true)).toContain(110);
    expect(gridValues(0, 1e9, 1, false)).toEqual([]); // guarded
  });
});

describe('entity index', () => {
  const d = {
    handles: ['A', 'B', 'C', 'D'],
    segEnt: new Uint32Array([0, 0, 2]),
    segLayer: new Uint16Array([1, 1, 0]),
    segColor: new Uint16Array([3, 3, 5]),
    polyEnt: new Uint32Array([2]),
    polyLayer: new Uint16Array([0]),
    polyColor: new Uint16Array([5]),
    texts: [[0, 0, 1, 0, 'left', 'baseline', 'C1', 4, 2, 1]] as never,
  };

  it('knows layer, colour and kind per object without asking the worker', () => {
    const ix = indexEntities(d);
    expect([...ix.layer]).toEqual([1, 2, 0, -1]);
    expect([...ix.color]).toEqual([3, 4, 5, -1]);
    expect(ix.kind[0]).toBe(OBJECT_KIND.line);
    expect(ix.kind[1]).toBe(OBJECT_KIND.text);
    expect(ix.kind[2]).toBe(OBJECT_KIND.line | OBJECT_KIND.fill);
    expect(ix.kind[3]).toBe(0);
  });

  it('names DXF types as AutoCAD and the worker do', () => {
    expect(objectTypeLabel('LINE')).toBe('Line');
    expect(objectTypeLabel('LWPOLYLINE')).toBe('Polyline');
    expect(objectTypeLabel('MTEXT')).toBe('MText');
    expect(objectTypeLabel('3DFACE')).toBe('3Dface'); // Python's str.title()
    expect(objectTypeLabel('ACAD_TABLE')).toBe('Acad_Table');
  });
});
