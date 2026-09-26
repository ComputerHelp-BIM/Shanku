import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { ElementRecord } from '../src/model/types';
import { buildGeometryIndex, type Bounds, type MeasureScene } from '../src/render/measure';
import { angularSector, arcFromEdge, circleThrough, dimensionLabel, dimensionSummary, dimensionValues, followModel, slopeOf, stringValues, type PlacedDimension } from '../src/render/dimensions';
import { workPlaneNormal } from '../src/render/dimensionTool';

/** A round column (radius r, n sides) at (cx, cz) from y0 to y1; feature edges on the two cap circles only, as the IFC loader keeps them. */
function roundColumn(r: number, n: number, cx = 0, cz = 0, y0 = 0, y1 = 3): MeasureScene {
  const pos: number[] = [], nor: number[] = [], ids: number[] = [], idx: number[] = [], epos: number[] = [], eids: number[] = [];
  const ring = (y: number) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), y, cz + r * Math.sin((2 * Math.PI * k) / n)]);
  const bot = ring(y0), top = ring(y1);
  const add = (p: number[]) => {
    pos.push(...p);
    nor.push(0, 1, 0);
    ids.push(0);
    return pos.length / 3 - 1;
  };
  const tc = add([cx, y1, cz]);
  const tr = top.map(add);
  for (let k = 0; k < n; k++) idx.push(tc, tr[(k + 1) % n], tr[k]);
  const bc = add([cx, y0, cz]);
  const br = bot.map(add);
  for (let k = 0; k < n; k++) idx.push(bc, br[k], br[(k + 1) % n]);
  for (let k = 0; k < n; k++) {
    const a = add(bot[k]), b = add(bot[(k + 1) % n]), c = add(top[(k + 1) % n]), d = add(top[k]);
    idx.push(a, b, c, a, c, d);
  }
  for (const ringPts of [bot, top]) for (let k = 0; k < n; k++) {
    epos.push(...ringPts[k], ...ringPts[(k + 1) % n]);
    eids.push(0, 0);
  }
  const el: ElementRecord = {
    index: 0, expressId: 1, globalId: 'COL', ifcClass: 'IfcColumn', category: 'Column', name: '', tag: '', typeName: '', level: 'L1', mark: 'C1', markSource: '',
    grade: '', gradeSource: '', volume: 0, area: null, length: null, quantitySource: 'geometry', dims: { length: null, width: null, depth: null, height: null },
    bounds: [cx - r, y0, cz - r, cx + r, y1, cz + r],
  };
  const mesh = { positions: new Float32Array(pos), normals: new Float32Array(nor), elementIds: new Float32Array(ids), indices: new Uint32Array(idx) };
  const edges = { positions: new Float32Array(epos), elementIds: new Float32Array(eids) };
  return { mesh, edges, elements: [el], index: buildGeometryIndex(mesh, edges, 1), hidden: new Set(), offset: () => null, bounds: () => el.bounds as Bounds, inside: () => true };
}

const dim = (d: Partial<PlacedDimension> & Pick<PlacedDimension, 'kind'>): PlacedDimension => ({ id: 'd', points: [], refs: [], at: [0, 0, 0], normal: [0, 1, 0], ...d });

describe('circles and arcs on elements', () => {
  it('finds the full circle of a round column from one cap edge (radius within 0.5 mm)', () => {
    const s = roundColumn(0.3, 32, 2, -1);
    const E = s.edges.positions;
    // one segment of the top ring
    const k = 32 * 6;
    const a = new Vector3(E[k], E[k + 1], E[k + 2]), b = new Vector3(E[k + 3], E[k + 4], E[k + 5]);
    const arc = arcFromEdge(s, 0, a, b)!;
    expect(arc).not.toBeNull();
    expect(arc.closed).toBe(true);
    expect(Math.abs(arc.radius - 0.3)).toBeLessThan(0.0005);
    expect(arc.centre.x).toBeCloseTo(2, 3);
    expect(arc.centre.z).toBeCloseTo(-1, 3);
    expect(arc.centre.y).toBeCloseTo(3, 3);
    expect(Math.abs(arc.normal.y)).toBeCloseTo(1);
  });

  it('finds an open arc and its sweep (a half-round nib: the arc stops at the straight edge)', () => {
    const s = roundColumn(0.5, 24);
    // keep the top ring's first half (12 segments) and close it with the straight diameter
    const E = s.edges.positions;
    const keep: number[] = [];
    for (let k = 24; k < 36; k++) keep.push(...Array.from(E.slice(k * 6, k * 6 + 6)));
    keep.push(-0.5, 3, 0, 0.5, 3, 0);
    s.edges = { positions: new Float32Array(keep), elementIds: new Float32Array(keep.length / 3).fill(0) };
    s.index = buildGeometryIndex(s.mesh, s.edges, 1);
    const k = 5 * 6;
    const arc = arcFromEdge(s, 0, new Vector3(keep[k], keep[k + 1], keep[k + 2]), new Vector3(keep[k + 3], keep[k + 4], keep[k + 5]))!;
    expect(arc.closed).toBe(false);
    expect(arc.radius).toBeCloseTo(0.5, 3);
    expect(arc.sweep).toBeCloseTo(Math.PI, 3);
    expect(dimensionValues({ id: 'a', kind: 'arcLength', points: [], refs: [], at: [0, 0, 0], normal: [0, 1, 0], arc: { centre: [0, 3, 0], radius: arc.radius, start: [0, 0, 0], end: [0, 0, 0], sweep: arc.sweep, closed: false } })).toEqual(['⌒ 1,571']);
  });

  it('says a straight edge is not an arc', () => {
    // a square "column" made with 4 sides: corners turn 90°, not an arc
    expect(arcFromEdge(roundColumn(0.3, 4), 0, new Vector3(0.3, 3, 0), new Vector3(0, 3, 0.3))).toBeNull();
  });

  it('fits a circle through three points', () => {
    const c = circleThrough(new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0))!;
    expect(c.radius).toBeCloseTo(1);
    expect(c.centre.length()).toBeCloseTo(0);
  });
});

describe('dimension values', () => {
  it('strings measure each step along the dimension direction, in mm', () => {
    const d = dim({ kind: 'aligned', points: [[0, 0, 0], [4.5, 0, 0.3], [6, 0, -2]], dir: [1, 0, 0] });
    expect(stringValues(d).map((x) => Math.round(x * 1000))).toEqual([4500, 1500]);
    expect(dimensionValues(d)).toEqual(['4,500', '1,500']);
    expect(dimensionSummary(d)).toBe('Aligned: 4,500 + 1,500 = 6,000 mm');
  });

  it('angular picks the quadrant the arc is placed in', () => {
    // lines along +X and at 60° through the origin (plan: normal +Y; −Z is north)
    const d60: [number, number, number] = [Math.cos(Math.PI / 3), 0, -Math.sin(Math.PI / 3)];
    const base = { kind: 'angular' as const, points: [[2, 0, 0], [d60[0] * 2, 0, d60[2] * 2]] as [number, number, number][], lines: [[1, 0, 0], d60] as [[number, number, number], [number, number, number]] };
    const inside = angularSector(dim({ ...base, at: [1, 0, -0.3] }))!;
    expect(inside.degrees).toBeCloseTo(60);
    const outside = angularSector(dim({ ...base, at: [-1, 0, -0.3] }))!;
    expect(outside.degrees).toBeCloseTo(120);
    expect(dimensionValues(dim({ ...base, at: [1, 0, -0.3] }))).toEqual(['60.00°']);
  });

  it('spot elevations and coordinates are the file’s own (origin shift taken off)', () => {
    const origin: [number, number, number] = [100, -2.5, 50];
    expect(dimensionValues(dim({ kind: 'spotElevation', points: [[0, 0.7, 0]] }), origin)).toEqual(['EL +3.200']);
    expect(dimensionValues(dim({ kind: 'spotCoordinate', points: [[112.345, 0, 44]] }), origin)).toEqual(['N +6.000', 'E +12.345']);
  });

  it('spot slope: percent rise, level faces say so', () => {
    const n = new Vector3(-1, 12, 0).normalize();
    const s = slopeOf(n)!;
    expect(s.ratio).toBeCloseTo(1 / 12);
    expect(s.downhill.x).toBeLessThan(0); // falls towards −X
    expect(dimensionValues(dim({ kind: 'spotSlope', slope: [n.x, n.y, n.z] }))).toEqual(['8.33%']);
    expect(dimensionValues(dim({ kind: 'spotSlope', slope: [0, 1, 0] }))).toEqual(['Level (0%)']);
    expect(dimensionValues(dim({ kind: 'spotSlope', slope: [1, 0, 0] }))).toEqual(['Vertical']);
  });

  it('radial, diameter and arc length', () => {
    const arc = { centre: [0, 0, 0] as [number, number, number], radius: 0.3, start: [0.3, 0, 0] as [number, number, number], end: [0, 0, 0.3] as [number, number, number], sweep: Math.PI / 2, closed: false };
    expect(dimensionValues(dim({ kind: 'radial', arc }))).toEqual(['R 300']);
    expect(dimensionValues(dim({ kind: 'diameter', arc }))).toEqual(['⌀ 600']);
    expect(dimensionValues(dim({ kind: 'arcLength', arc }))).toEqual(['⌒ 471']);
  });

  it('text overrides: prefix, suffix and replace', () => {
    expect(dimensionLabel(dim({ kind: 'aligned', text: { prefix: 'CLR', suffix: 'TYP.' } }), '450')).toBe('CLR 450 TYP.');
    expect(dimensionLabel(dim({ kind: 'aligned', text: { replace: 'EQ' } }), '450')).toBe('EQ');
  });
});

describe('dimensions follow the model', () => {
  const el = (globalId: string, b: [number, number, number, number, number, number]) => ({ globalId, bounds: b }) as unknown as ElementRecord;
  it('moves references with their element and drops dimensions to deleted elements', () => {
    const d = dim({ kind: 'aligned', points: [[0, 0, 0], [5, 0, 0]], refs: [{ globalId: 'A', anchor: [0, 1, 0] }, { globalId: 'B', anchor: [5, 1, 0] }], dir: [1, 0, 0], at: [2, 0, 1] });
    const r = followModel([d], [el('A', [-0.15, 0, -0.15, 0.15, 2, 0.15]), el('B', [5.35, 0, -0.15, 5.65, 2, 0.15])]);
    expect(r.moved).toBe(1);
    expect(stringValues(r.dims[0])[0]).toBeCloseTo(5.5); // B moved 500 mm east
    const gone = followModel([d], [el('A', [-0.15, 0, -0.15, 0.15, 2, 0.15])]);
    expect(gone.dropped).toBe(1);
    expect(gone.dims).toHaveLength(0);
  });
});

describe('work plane in 3D', () => {
  it('is the world plane facing the camera most', () => {
    expect(workPlaneNormal(new Vector3(-0.3, -0.9, -0.3).normalize()).y).toBeCloseTo(1); // looking down: plan
    expect(Math.abs(workPlaneNormal(new Vector3(0.1, -0.2, -0.97).normalize()).z)).toBeCloseTo(1); // looking north: elevation
  });
});
