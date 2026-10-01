import { describe, expect, it } from 'vitest';
import { deriveElement, planOf, volumeOf, type ParamElement, type Tri } from '../src/model/parametric';
import { meshOfElement } from '../src/edit/geometry';

/** Drawn geometry read back by the converter: the same parameters (drawing and reading agree). */
function readBack(e: ParamElement) {
  const g = meshOfElement(e);
  const pt = (i: number) => planOf(g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]);
  const tris: Tri[] = [];
  for (let k = 0; k < g.indices.length; k += 3) tris.push([pt(g.indices[k]), pt(g.indices[k + 1]), pt(g.indices[k + 2])]);
  return deriveElement({ id: e.id, kind: e.kind, mark: e.mark, material: e.material, level: e.level }, tris, volumeOf(e));
}
const base = { mark: 'X', material: 'M25', level: 'Level 2' };

describe('geometry from parameters', () => {
  it('a rotated column, a round column, a beam and a slab with a hole read back as themselves', () => {
    const col: ParamElement = { id: 'c', kind: 'column', ...base, z0: 0, z1: 3000, shape: 'rect', center: [5000, 2000], width: 600, length: 300, angle: 30 };
    const rc = readBack(col) as ParamElement;
    expect(rc.center).toEqual([5000, 2000]);
    expect([rc.width, rc.length].sort()).toEqual([300, 600]);
    const round: ParamElement = { id: 'r', kind: 'column', ...base, z0: 0, z1: 3000, shape: 'round', center: [0, 0], diameter: 450 };
    expect(readBack(round)).toMatchObject({ shape: 'round', diameter: 450 });
    const beam: ParamElement = { id: 'b', kind: 'beam', ...base, z0: 2550, z1: 3000, start: [0, 0], end: [3000, 4000], thickness: 230, depth: 450 };
    const rb = readBack(beam) as ParamElement;
    expect(Math.hypot(rb.end![0] - rb.start![0], rb.end![1] - rb.start![1])).toBeCloseTo(5000, 0);
    expect(rb).toMatchObject({ thickness: 230, depth: 450 });
    const slab: ParamElement = { id: 's', kind: 'slab', ...base, z0: 2850, z1: 3000, thickness: 150, outline: [[0, 0], [6000, 0], [6000, 4000], [0, 4000]], holes: [[[1000, 1000], [1000, 2000], [2000, 2000], [2000, 1000]]] };
    const rs = readBack(slab) as ParamElement;
    expect(volumeOf(rs)).toBeCloseTo(volumeOf(slab), 6);
    expect(rs.holes).toHaveLength(1);
  });

  it('draws in the viewer space (Y up, metres) with outward caps', () => {
    const g = meshOfElement({ id: 'c', kind: 'column', ...base, z0: 0, z1: 3000, shape: 'rect', center: [1000, 2000], width: 300, length: 300, angle: 0 });
    const ys = g.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(3);
    expect(g.indices.length / 3).toBe(12); // 2 + 2 caps, 8 sides
    expect(g.normals.slice(0, 3)).toEqual([0, 1, 0]); // the first face is the top
  });
});
