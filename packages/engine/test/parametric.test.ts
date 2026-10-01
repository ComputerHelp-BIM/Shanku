import { describe, expect, it } from 'vitest';
import { deriveElement, fromExchange, isReference, planOf, trianglesOf, volumeOf, type ParamElement, type Pt, type Tri } from '../src/model/parametric';

/** A prism: plan polygon (counter-clockwise), from z0 to z1, as triangles (fan caps + side quads). */
function prism(poly: Pt[], z0: number, z1: number): Tri[] {
  const t: Tri[] = [];
  for (let i = 1; i < poly.length - 1; i++) {
    t.push([[...poly[0], z1], [...poly[i], z1], [...poly[i + 1], z1]]);
    t.push([[...poly[0], z0], [...poly[i + 1], z0], [...poly[i], z0]]);
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    t.push([[...a, z0], [...b, z0], [...b, z1]], [[...a, z0], [...b, z1], [...a, z1]]);
  }
  return t;
}
const rect = (c: Pt, w: number, l: number, deg: number): Pt[] => {
  const t = (deg * Math.PI) / 180, u: Pt = [Math.cos(t), Math.sin(t)], v: Pt = [-Math.sin(t), Math.cos(t)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + (a * w * u[0]) / 2 + (b * l * v[0]) / 2, c[1] + (a * w * u[1]) / 2 + (b * l * v[1]) / 2]);
};
const base = (kind: ParamElement['kind']) => ({ id: 'g', kind, mark: 'X1', material: 'M25', level: 'Level 2' });

describe('parametric elements from IFC geometry', () => {
  it('a rotated rectangular column', () => {
    const e = deriveElement(base('column'), prism(rect([5000, 2000], 300, 600, 30), 0, 3000));
    expect(isReference(e)).toBe(false);
    const c = e as ParamElement;
    expect(c).toMatchObject({ shape: 'rect', center: [5000, 2000], z0: 0, z1: 3000 });
    expect([c.width, c.length].sort()).toEqual([300, 600]);
    expect((((c.angle! - 30) % 90) + 90) % 90).toBeCloseTo(0, 3);
  });

  it('a round column', () => {
    const poly: Pt[] = Array.from({ length: 32 }, (_, i) => [1000 + 225 * Math.cos((i * Math.PI) / 16), 1000 + 225 * Math.sin((i * Math.PI) / 16)]);
    expect(deriveElement(base('column'), prism(poly, 0, 3000))).toMatchObject({ shape: 'round', center: [1000, 1000], diameter: 450 });
  });

  it('a beam at 45°: its centreline, width and depth', () => {
    const b = deriveElement(base('beam'), prism(rect([2000, 2000], 4000, 230, 45), 2550, 3000)) as ParamElement;
    expect(Math.hypot(b.end![0] - b.start![0], b.end![1] - b.start![1])).toBeCloseTo(4000, 0);
    expect([(b.start![0] + b.end![0]) / 2, (b.start![1] + b.end![1]) / 2]).toEqual([2000, 2000]);
    expect(b).toMatchObject({ thickness: 230, depth: 450, z0: 2550, z1: 3000 });
  });

  it('an L-shaped slab with a hole: outline and hole from its top face', () => {
    const tris: Tri[] = [];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        if (i >= 3 && j >= 3) continue; // the L
        if (i === 1 && j === 1) continue; // the hole
        const [x, y] = [i * 1000, j * 1000];
        tris.push(...prism([[x, y], [x + 1000, y], [x + 1000, y + 1000], [x, y + 1000]], 2850, 3000));
      }
    const s = deriveElement(base('slab'), tris) as ParamElement;
    const ar = (p: Pt[]) => p.reduce((a, q, k) => a + (q[0] * p[(k + 1) % p.length][1] - p[(k + 1) % p.length][0] * q[1]), 0) / 2;
    expect(s.outline).toHaveLength(6);
    expect(ar(s.outline!)).toBe(27e6); // counter-clockwise, 6 × 6 − 3 × 3 cells
    expect(s.holes).toHaveLength(1);
    expect(ar(s.holes![0])).toBe(-1e6); // clockwise
    expect(s.thickness).toBe(150);
    expect(volumeOf(s)).toBeCloseTo(26 * 0.15, 6); // 27 − 1 cells of 1 m², 150 mm
  });

  it('keeps what does not fit cleanly as reference, with the reason', () => {
    const plus: Pt[] = [[100, 0], [200, 0], [200, 100], [300, 100], [300, 200], [200, 200], [200, 300], [100, 300], [100, 200], [0, 200], [0, 100], [100, 100]];
    expect(deriveElement(base('column'), prism(plus, 0, 3000))).toEqual({ id: 'g', reason: 'not a rectangle in plan' });
    const sloped: Tri[] = [[[0, 0, 3000], [4000, 0, 3000], [4000, 4000, 3400]], [[0, 0, 3000], [4000, 4000, 3400], [0, 4000, 3400]]];
    expect(deriveElement(base('slab'), sloped)).toMatchObject({ reason: expect.stringMatching(/flat top/) });
    // one slab element in two separate pieces (found in a real model): reference, not half of it
    const twoPieces = [...prism([[0, 0], [2000, 0], [2000, 2000], [0, 2000]], 2850, 3000), ...prism([[5000, 0], [7000, 0], [7000, 2000], [5000, 2000]], 2850, 3000)];
    expect(deriveElement(base('slab'), twoPieces)).toEqual({ id: 'g', reason: 'in separate pieces' });
    // a slab with a sunk part: its lower part has no top face at the slab's top
    const stepped = [...prism([[0, 0], [3000, 0], [3000, 3000], [0, 3000]], 2850, 3000), ...prism([[3000, 0], [6000, 0], [6000, 3000], [3000, 3000]], 2700, 2850)];
    expect(deriveElement(base('slab'), stepped)).toMatchObject({ reason: expect.stringMatching(/step/) });
    // the IFC's own volume must be reproduced by the parameters
    const c = prism(rect([0, 0], 300, 600, 0), 0, 3000);
    expect(deriveElement(base('column'), c, 0.54)).toMatchObject({ shape: 'rect' });
    expect(deriveElement(base('column'), c, 1.08)).toEqual({ id: 'g', reason: 'its parameters would change its volume by -50 %' });
  });

  it('reads an element from the merged mesh, in plan mm', () => {
    // one triangle of element 0, one of element 1; viewer Y-up metres → plan (x, −z) mm, height y
    const mesh = { positions: new Float32Array([1, 2, -3, 1, 2, -4, 2, 2, -3, 0, 0, 0, 1, 0, 0, 0, 0, 1]), elementIds: new Float32Array([0, 0, 0, 1, 1, 1]), indices: new Uint32Array([0, 1, 2, 3, 4, 5]) };
    expect(trianglesOf(mesh, 0)).toEqual([[[1000, 3000, 2000], [1000, 4000, 2000], [2000, 3000, 2000]]]);
    expect(planOf(0.5, 3, -2)).toEqual([500, 2000, 3000]);
  });

  it('takes DXF → 3D models as they are', () => {
    const els = fromExchange({ version: 1, units: 'mm', levels: [], skipped: [], elements: [
      { id: 'DXF:1A:L2', kind: 'column', mark: 'C1', material: 'M25', level: 'Level 2', z0: 0, z1: 3000, shape: 'rect', center: [0, 0], width: 300, length: 600, angle: 0 },
      { id: 'DXF:2B:L2', kind: 'window', mark: 'W1', material: null, level: 'Level 2', z0: 900, z1: 2100 },
    ] });
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ id: 'DXF:1A:L2', kind: 'column', width: 300, source: { handle: 'DXF:1A:L2' } });
  });
});
