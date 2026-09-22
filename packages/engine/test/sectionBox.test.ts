import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { aabbOf, contains, moveFace, planesOf, snapDelta, MIN_HALF, type SectionBoxState } from '../src/render/sectionBox';

const box = (angle = 0): SectionBoxState => ({ center: new Vector3(0, 0, 0), half: new Vector3(2, 1, 3), angle });
const inside = (st: SectionBoxState, p: Vector3) => planesOf(st).every((pl) => pl.distanceToPoint(p) >= -1e-9);

describe('section box', () => {
  it('clips to exactly the box, also when rotated', () => {
    for (const a of [0, Math.PI / 6, 1.1]) {
      const st = box(a);
      for (const p of [new Vector3(0, 0, 0), new Vector3(1.9, 0.9, -2.9), new Vector3(2.1, 0, 0), new Vector3(0, 1.2, 0), new Vector3(0, 0, -3.3)]) {
        expect(inside(st, p)).toBe(contains(st, p));
      }
    }
  });

  it('moves one face and keeps the opposite face fixed', () => {
    const st = moveFace(box(), 0, 1, 1.0); // +X face out by 1 m
    expect(st.half.x).toBeCloseTo(2.5);
    expect(st.center.x).toBeCloseTo(0.5);
    expect(st.center.x - st.half.x).toBeCloseTo(-2); // -X face unchanged
    const shrunk = moveFace(box(), 1, -1, -5); // bottom face far up: clamped
    expect(shrunk.half.y).toBe(MIN_HALF);
  });

  it('moves faces along rotated axes', () => {
    const st = moveFace(box(Math.PI / 2), 0, 1, 2); // local +X points to world -Z at 90°
    expect(st.center.z).toBeCloseTo(-1);
    expect(st.center.x).toBeCloseTo(0);
  });

  it('snaps a face to 100 mm steps', () => {
    const st = { ...box(), center: new Vector3(0.03, 0, 0) }; // +X face at 2.03
    const d = snapDelta(st, 0, 1, 0.14, 0.1); // 2.17 -> 2.2
    expect(st.center.x + st.half.x + d).toBeCloseTo(2.2);
  });

  it('reports world bounds of a rotated box', () => {
    const b = aabbOf(box(Math.PI / 4));
    expect(b.max.x).toBeCloseTo((2 + 3) * Math.SQRT1_2);
    expect(b.max.y).toBeCloseTo(1);
  });
});
