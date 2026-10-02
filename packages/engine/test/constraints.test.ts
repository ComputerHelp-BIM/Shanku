import { describe, expect, it } from 'vitest';
import type { ParamElement } from '../src/model/parametric';
import { align, move } from '../src/edit/ops';
import { brokenLocks, lockHolds, type AlignLock } from '../src/edit/constraints';

const col: ParamElement = { id: 'c1', kind: 'column', mark: 'C1', material: null, level: 'L2', z0: 0, z1: 3000, shape: 'rect', center: [1000, 2000], width: 300, length: 600, angle: 0 };
const grid1 = { a: [0, 0] as [number, number], b: [0, 10000] as [number, number] }; // x = 0, north–south
const lines = (id: string) => (id === 'g1' ? grid1 : null);

describe('Align locks', () => {
  it('a face aligned and locked to a grid holds; moving along the grid keeps it; moving off breaks it', () => {
    const aligned = align([col], grid1.a, grid1.b, 'face').changed[0];
    expect(aligned.center![0]).toBe(150); // its 300 face on x = 0
    const lock: AlignLock = { id: 'k1', element: 'c1', datum: 'g1', to: 'face' };
    expect(lockHolds(aligned, lock, grid1)).toBe(true);
    const along = move([aligned], 0, 2500).changed;
    expect(brokenLocks(along, [lock], lines)).toEqual([]);
    const off = move([aligned], 400, 0).changed;
    expect(brokenLocks(off, [lock], lines)).toEqual([lock]);
  });

  it('a centre lock; locks on elements an edit does not touch, or on deleted datums, are not broken', () => {
    const centred = align([col], grid1.a, grid1.b, 'center').changed[0];
    const lock: AlignLock = { id: 'k2', element: 'c1', datum: 'g1', to: 'center' };
    expect(lockHolds(centred, lock, grid1)).toBe(true);
    expect(brokenLocks(move([centred], 10, 0).changed, [lock], lines)).toHaveLength(1);
    expect(brokenLocks([{ ...centred, id: 'other' }], [lock], lines)).toEqual([]);
    expect(brokenLocks(move([centred], 10, 0).changed, [{ ...lock, datum: 'gone' }], lines)).toEqual([]);
  });
});
