import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Category, ElementRecord } from '../src/model/types';
import {
  axisDistance,
  buildGeometryIndex,
  clearDistance,
  connectedChain,
  faceOrientation,
  measureBetween,
  memberAxis,
  planarFace,
  raycastAll,
  snapCandidates,
  type Bounds,
  type MeasurePick,
  type MeasureScene,
} from '../src/render/measure';

/** Boxes laid out like the IFC loader's buffers: 4 vertices per face (flat shading), 12 feature edges. */
function scene(boxes: Array<{ min: [number, number, number]; max: [number, number, number]; category?: Category }>): MeasureScene {
  const pos: number[] = [], nor: number[] = [], ids: number[] = [], idx: number[] = [], epos: number[] = [], eids: number[] = [];
  const elements: ElementRecord[] = [];
  boxes.forEach((b, e) => {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const c = (i: number): [number, number, number] => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
    // faces as corner indices, counter-clockwise from outside
    const faces: Array<[number[], [number, number, number]]> = [
      [[0, 4, 6, 2], [-1, 0, 0]], [[1, 3, 7, 5], [1, 0, 0]],
      [[0, 1, 5, 4], [0, -1, 0]], [[2, 6, 7, 3], [0, 1, 0]],
      [[0, 2, 3, 1], [0, 0, -1]], [[4, 5, 7, 6], [0, 0, 1]],
    ];
    for (const [f, n] of faces) {
      const base = pos.length / 3;
      for (const k of f) {
        pos.push(...c(k));
        nor.push(...n);
        ids.push(e);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    for (const [p, q] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      epos.push(...c(p), ...c(q));
      eids.push(e, e);
    }
    elements.push({
      index: e, expressId: e + 1, globalId: `G${e}`, ifcClass: 'IfcBeam', category: b.category ?? 'Beam', name: '', tag: '', typeName: '', level: 'L1',
      mark: '', markSource: '', grade: '', gradeSource: '', volume: 0, area: null, length: null, quantitySource: 'geometry',
      dims: { length: null, width: null, depth: null, height: null }, bounds: [x0, y0, z0, x1, y1, z1],
    });
  });
  const mesh = { positions: new Float32Array(pos), normals: new Float32Array(nor), elementIds: new Float32Array(ids), indices: new Uint32Array(idx) };
  const edges = { positions: new Float32Array(epos), elementIds: new Float32Array(eids) };
  return {
    mesh, edges, elements, index: buildGeometryIndex(mesh, edges, elements.length), hidden: new Set(),
    offset: () => null, bounds: (i) => elements[i].bounds as Bounds, inside: () => true,
  };
}

const down = new Vector3(0, -1, 0);

describe('ray casting (Tab through what is under the cursor)', () => {
  it('lists every element under the cursor front to back, one hit each', () => {
    // slab on top, beam under it, footing at the bottom, all under x = 0.5, z = 0.5
    const s = scene([
      { min: [0, 0, 0], max: [1, 0.5, 1], category: 'Footing' },
      { min: [0, 3, 0], max: [4, 3.5, 1], category: 'Beam' },
      { min: [-2, 3.5, -2], max: [6, 3.65, 3], category: 'Slab' },
    ]);
    const hits = raycastAll(s, new Vector3(0.5, 100, 0.5), down);
    expect(hits.map((h) => s.elements[h.index].category)).toEqual(['Slab', 'Beam', 'Footing']);
    expect(hits[0].point.y).toBeCloseTo(3.65);
    expect(hits[0].normal.y).toBeCloseTo(1); // turned towards the viewer
  });

  it('skips hidden elements and faces cut away by the section box', () => {
    const s = scene([{ min: [0, 0, 0], max: [1, 1, 1] }, { min: [0, 2, 0], max: [1, 3, 1] }]);
    s.hidden = new Set([1]);
    expect(raycastAll(s, new Vector3(0.5, 10, 0.5), down).map((h) => h.index)).toEqual([0]);
    s.hidden = new Set();
    s.inside = (p) => p.y < 2.5; // section box cuts the upper box at 2.5: its top is gone, its bottom stays
    const hits = raycastAll(s, new Vector3(0.5, 10, 0.5), down);
    expect(hits[0].index).toBe(1);
    expect(hits[0].point.y).toBeCloseTo(2);
  });
});

describe('faces', () => {
  it('finds the whole flat face with its area, perimeter and centre', () => {
    const s = scene([{ min: [0, 0, 0], max: [4, 0.2, 3], category: 'Slab' }]);
    const hit = raycastAll(s, new Vector3(1, 10, 1), down)[0];
    const f = planarFace(s, 0, hit.tri);
    expect(f.area).toBeCloseTo(12);
    expect(f.perimeter).toBeCloseTo(14);
    expect(f.centroid.x).toBeCloseTo(2);
    expect(f.centroid.z).toBeCloseTo(1.5);
    expect(f.outline).toHaveLength(4); // the diagonal between the two triangles is not an outline edge
    expect(faceOrientation(f.normal)).toBe('Top face');
  });

  it('names side faces by compass direction (north is −Z)', () => {
    expect(faceOrientation(new Vector3(0, 0, -1))).toBe('Side face facing N');
    expect(faceOrientation(new Vector3(1, 0, 0))).toBe('Side face facing E');
    expect(faceOrientation(new Vector3(0, -1, 0))).toBe('Bottom face (soffit)');
  });
});

describe('centrelines', () => {
  it('columns are vertical through the section centre; beams follow their length', () => {
    const s = scene([
      { min: [0, 0, 0], max: [0.3, 3, 0.6], category: 'Column' },
      { min: [0, 3, 0], max: [5, 3.6, 0.3], category: 'Beam' },
    ]);
    const c = memberAxis(s, 0)!;
    expect(c.a.x).toBeCloseTo(0.15);
    expect(c.a.z).toBeCloseTo(0.3);
    expect(c.a.y).toBeCloseTo(0);
    expect(c.length).toBeCloseTo(3);
    const b = memberAxis(s, 1)!;
    expect(Math.abs(b.dir.x)).toBeCloseTo(1);
    expect(b.length).toBeCloseTo(5);
    expect(b.a.y).toBeCloseTo(3.3);
    expect(b.width).toBeCloseTo(0.6);
    expect(memberAxis(scene([{ min: [0, 0, 0], max: [1, 1, 1], category: 'Slab' }]), 0)).toBeNull();
  });

  it('gives centre-to-centre between parallel columns', () => {
    const s = scene([
      { min: [0, 0, 0], max: [0.3, 3, 0.3], category: 'Column' },
      { min: [4.5, 0, 0], max: [4.8, 3, 0.3], category: 'Column' },
    ]);
    const r = axisDistance(memberAxis(s, 0)!, memberAxis(s, 1)!);
    expect(r.parallel).toBe(true);
    expect(r.distance).toBeCloseTo(4.5);
  });
});

describe('clear distance', () => {
  it('is the gap between the faces that face each other', () => {
    const s = scene([
      { min: [0, 0, 0], max: [0.3, 3, 0.3], category: 'Column' },
      { min: [4.5, 0, 0], max: [4.8, 3, 0.3], category: 'Column' },
    ]);
    expect(clearDistance(s, 0, 1).distance).toBeCloseTo(4.2);
  });

  it('finds edge-to-edge gaps between offset boxes, and 0 when one passes into the other', () => {
    const s = scene([
      { min: [0, 0, 0], max: [1, 1, 1] },
      { min: [2, 0, 2], max: [3, 1, 3] }, // diagonal: corner edge to corner edge
      { min: [0.8, 0.2, 0.2], max: [1.5, 0.8, 0.8] }, // beam end built into box 0
    ]);
    expect(clearDistance(s, 0, 1).distance).toBeCloseTo(Math.SQRT2);
    const o = clearDistance(s, 0, 2);
    expect(o.distance).toBe(0);
    expect(o.overlapping).toBe(true);
  });
});

describe('chains (Tab on connected elements, like wall joins)', () => {
  it('follows walls joined end to end around a corner, not a parallel wall nearby', () => {
    const s = scene([
      { min: [0, 0, 0], max: [5, 3, 0.23], category: 'Wall' }, // along X
      { min: [4.77, 0, 0.23], max: [5, 3, 4], category: 'Wall' }, // corner at x = 5, along Z
      { min: [4.77, 0, 4], max: [9, 3, 4.23], category: 'Wall' }, // continues along X
      { min: [0, 0, 3], max: [3, 3, 3.23], category: 'Wall' }, // separate, parallel to the first
      { min: [0, 3, 0], max: [5, 6, 0.23], category: 'Wall' }, // stacked on the first: another storey
    ]);
    const axisOf = (i: number) => memberAxis(s, i);
    expect(connectedChain(s, 0, axisOf).sort()).toEqual([0, 1, 2]);
    expect(connectedChain(s, 3, axisOf)).toEqual([3]);
  });

  it('does not chain across categories', () => {
    const s = scene([
      { min: [0, 3, 0], max: [5, 3.5, 0.3], category: 'Beam' },
      { min: [5, 3, 0], max: [10, 3.5, 0.3], category: 'Beam' },
      { min: [4.85, 0, 0], max: [5.15, 3.5, 0.3], category: 'Column' },
    ]);
    const chain = connectedChain(s, 0, (i) => memberAxis(s, i));
    expect(chain.sort()).toEqual([0, 1]);
  });
});

describe('measure between references', () => {
  const pick = (p: [number, number, number], ref: MeasurePick['ref'] = { kind: 'point' }): MeasurePick => ({ point: new Vector3(...p), kind: 'endpoint', ref, index: 0 });

  it('reports total and Revit ΔX ΔY ΔZ (east, north, up)', () => {
    const r = measureBetween(pick([0, 0, 0]), pick([3, 4, -12]));
    expect(r.total).toBeCloseTo(13);
    expect(r.delta[0]).toBeCloseTo(3);
    expect(r.delta[1]).toBeCloseTo(12); // −Z is north
    expect(r.delta[2]).toBeCloseTo(4);
    expect(r.perpendicular).toBeNull();
  });

  it('measures in the view plane in 2D views, keeping the true length', () => {
    const r = measureBetween(pick([0, 0, 0]), pick([3, 2, -4]), new Vector3(0, -1, 0));
    expect(r.planar).toBe(true);
    expect(r.total).toBeCloseTo(5);
    expect(r.delta[2]).toBeCloseTo(0);
    expect(r.length3d).toBeCloseTo(Math.hypot(3, 2, 4));
  });

  it('adds the perpendicular distance between parallel faces', () => {
    const up = new Vector3(0, 1, 0);
    const r = measureBetween(pick([0, 0, 0], { kind: 'face', normal: up, point: new Vector3(0, 0, 0) }), pick([2, 3, 1], { kind: 'face', normal: up.clone().negate(), point: new Vector3(9, 3, 9) }));
    expect(r.perpendicular?.value).toBeCloseTo(3);
    expect(r.perpendicular?.label).toBe('Between parallel faces');
  });
});

describe('snapping', () => {
  const setup = () => {
    const s = scene([{ min: [0, 0, 0], max: [2, 1, 2], category: 'Column' }]);
    // Plan-like projection: 100 px per metre, looking down.
    const project = (p: Vector3): [number, number] => [p.x * 100, p.z * 100];
    const query = (cx: number, cz: number) => ({
      origin: new Vector3(cx / 100, 50, cz / 100), dir: down, cursor: [cx, cz] as [number, number], project, radius: 10, pixel: 0.01,
      axisOf: (i: number) => memberAxis(s, i), faceOf: (i: number, t: number) => planarFace(s, i, t),
    });
    return { s, query };
  };

  it('prefers the endpoint near the cursor, and Tab can reach the face', () => {
    const { s, query } = setup();
    const { candidates } = snapCandidates(s, query(196, 5));
    expect(candidates[0].kind).toBe('endpoint');
    expect(candidates[0].point.x).toBeCloseTo(2);
    expect(candidates[0].point.y).toBeCloseTo(1); // the top corner, not the bottom one behind it
    expect(candidates.map((c) => c.kind)).toContain('face');
  });

  it('snaps to the face centre and the column centreline end at the middle of the top', () => {
    const { s, query } = setup();
    const kinds = snapCandidates(s, query(101, 99)).candidates.map((c) => c.kind);
    expect(kinds[0]).toMatch(/centre|axisEnd/);
    expect(kinds).toContain('centre');
    expect(kinds).toContain('axisEnd');
  });

  it('offers midpoints and nearest-on-edge along an edge', () => {
    const { s, query } = setup();
    const kinds = snapCandidates(s, query(100, 3)).candidates.map((c) => c.kind);
    expect(kinds[0]).toBe('midpoint');
    expect(snapCandidates(s, query(60, 3)).candidates[0].kind).toBe('edge');
  });
});
