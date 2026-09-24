import { describe, expect, it } from 'vitest';
import type { Category, ElementRecord } from '../src/model/types';
import { explodeOffsets, explodedBounds } from '../src/render/explode';

/** A minimal element: only the fields the exploded view reads. */
function el(index: number, category: Category, level: string, bounds: ElementRecord['bounds']): ElementRecord {
  return { index, category, level, bounds } as ElementRecord;
}

// Three storeys, 3 m apart (Y up), columns and slabs; one footing without a level below everything.
const model = [
  el(0, 'Footing', '', [0, -1.5, 0, 2, -0.5, 2]),
  el(1, 'Column', 'Level 1', [0, 0, 0, 0.4, 3, 0.4]),
  el(2, 'Slab', 'Level 2', [0, 2.8, 0, 10, 3, 10]),
  el(3, 'Column', 'Level 2', [9.6, 3, 9.6, 10, 6, 10]),
  el(4, 'Slab', 'Level 3', [0, 5.8, 0, 10, 6, 10]),
];
const at = (o: Float32Array, i: number) => [o[i * 3], o[i * 3 + 1], o[i * 3 + 2]];

describe('exploded view offsets', () => {
  it('lifts each storey by one typical storey height per storey below it', () => {
    const o = explodeOffsets(model, 'storeys');
    // Level bases: Level 1 at 0, Level 2 at 2.8, Level 3 at 5.8 → gaps 2.8 and 3.0; the (upper) median is 3.0 m.
    expect(at(o, 1)[1]).toBeCloseTo(0);
    expect(at(o, 2)[1]).toBeCloseTo(3);
    expect(at(o, 3)[1]).toBeCloseTo(3);
    expect(at(o, 4)[1]).toBeCloseTo(6);
    // No level and below every level: stays with the lowest storey, moves only vertically.
    expect(at(o, 0)).toEqual([0, 0, 0]);
    for (let i = 0; i < model.length; i++) expect([at(o, i)[0], at(o, i)[2]]).toEqual([0, 0]);
  });

  it('moves elements away from the plan centre by their own distance from it', () => {
    const o = explodeOffsets(model, 'radial');
    // Plan extent 0-10 in X and Z → centre (5, 5).
    expect(at(o, 1)[0]).toBeCloseTo(0.2 - 5);
    expect(at(o, 1)[2]).toBeCloseTo(0.2 - 5);
    expect(at(o, 3)[0]).toBeCloseTo(9.8 - 5);
    expect(at(o, 2)).toEqual([0, 0, 0]); // centred slab stays put
    for (let i = 0; i < model.length; i++) expect(at(o, i)[1]).toBe(0);
  });

  it('lays categories side by side along X in category order, centred', () => {
    const o = explodeOffsets(model, 'categories');
    // Order: Footing, Column, Slab → slots -1, 0, +1 × (10 m × 1.25).
    expect(at(o, 0)[0]).toBeCloseTo(-12.5);
    expect(at(o, 1)[0]).toBeCloseTo(0);
    expect(at(o, 3)[0]).toBeCloseTo(0);
    expect(at(o, 2)[0]).toBeCloseTo(12.5);
    expect(at(o, 4)[0]).toBeCloseTo(12.5);
  });

  it('handles an empty model and scales bounds by the amount', () => {
    expect(explodeOffsets([], 'storeys')).toHaveLength(0);
    const o = explodeOffsets(model, 'storeys');
    expect(explodedBounds(model[4].bounds, o, 4, 0)).toBe(model[4].bounds);
    expect(explodedBounds(model[4].bounds, o, 4, 0.5)[1]).toBeCloseTo(5.8 + 3);
    expect(explodedBounds(model[4].bounds, null, 4, 1)).toBe(model[4].bounds);
  });
});
