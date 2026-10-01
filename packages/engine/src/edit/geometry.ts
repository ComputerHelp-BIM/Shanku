/**
 * Geometry from parametric elements, in the viewer's space (Y-up, metres; the inverse of planOf), and the
 * patch that puts edited elements into the model through mergeModels — the same path live updates from
 * Revit take, so edited elements select, hide, colour and check like any other.
 */
import { ShapeUtils, Vector2 } from 'three';
import type { ElementRecord, ParsedModel } from '../model/types';
import { volumeOf, type ParamElement, type Pt } from '../model/parametric';

export interface ElementMesh {
  positions: number[];
  normals: number[];
  indices: number[];
  edges: number[];
}

/** Plan mm + height mm → viewer metres (x, y up, z = −plan Y). */
const v = (p: Pt, z: number): [number, number, number] => [p[0] / 1000, z / 1000, -p[1] / 1000];
const signedArea = (pts: Pt[]) => pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1]), 0) / 2;

/** The element's plan outline (counter-clockwise) and holes. */
export function planShape(e: ParamElement): { outline: Pt[]; holes: Pt[][] } {
  if (e.outline) return { outline: e.outline, holes: e.holes ?? [] };
  if (e.shape === 'round' && e.center && e.diameter) {
    const r = e.diameter / 2;
    return { outline: Array.from({ length: 32 }, (_, i) => [e.center![0] + r * Math.cos((i * Math.PI) / 16), e.center![1] + r * Math.sin((i * Math.PI) / 16)] as Pt), holes: [] };
  }
  if (e.center && e.width !== undefined && e.length !== undefined) {
    const t = ((e.angle ?? 0) * Math.PI) / 180,
      u: Pt = [Math.cos(t), Math.sin(t)],
      w: Pt = [-Math.sin(t), Math.cos(t)];
    const c = e.center;
    return { outline: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + (a * e.width! * u[0]) / 2 + (b * e.length! * w[0]) / 2, c[1] + (a * e.width! * u[1]) / 2 + (b * e.length! * w[1]) / 2] as Pt), holes: [] };
  }
  if (e.start && e.end && e.thickness !== undefined) {
    const len = Math.hypot(e.end[0] - e.start[0], e.end[1] - e.start[1]) || 1;
    const n: Pt = [(-(e.end[1] - e.start[1]) / len) * (e.thickness / 2), ((e.end[0] - e.start[0]) / len) * (e.thickness / 2)];
    return { outline: [[e.start[0] - n[0], e.start[1] - n[1]], [e.end[0] - n[0], e.end[1] - n[1]], [e.end[0] + n[0], e.end[1] + n[1]], [e.start[0] + n[0], e.start[1] + n[1]]], holes: [] };
  }
  return { outline: [], holes: [] };
}

/** A prism from the plan shape, z0 → z1: flat-shaded triangles and its edges. */
export function meshOfElement(e: ParamElement): ElementMesh {
  const out: ElementMesh = { positions: [], normals: [], indices: [], edges: [] };
  const { outline, holes } = planShape(e);
  if (outline.length < 3) return out;
  const ring = signedArea(outline) >= 0 ? outline : [...outline].reverse();
  const hs = holes.map((h) => (signedArea(h) <= 0 ? h : [...h].reverse()));
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = out.positions.length / 3;
    out.positions.push(...a, ...b, ...c);
    out.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    out.indices.push(base, base + 1, base + 2);
  };
  // caps: triangulated with the holes (three's earcut)
  const all = [...ring, ...hs.flat()];
  const faces = ShapeUtils.triangulateShape(ring.map((p) => new Vector2(p[0], p[1])), hs.map((h) => h.map((p) => new Vector2(p[0], p[1]))));
  for (const [a, b, c] of faces) {
    tri(v(all[a], e.z1), v(all[b], e.z1), v(all[c], e.z1)); // top, facing up
    tri(v(all[a], e.z0), v(all[c], e.z0), v(all[b], e.z0)); // bottom, facing down
  }
  // sides and edges for every loop
  for (const loop of [ring, ...hs]) {
    loop.forEach((p, i) => {
      const q = loop[(i + 1) % loop.length];
      tri(v(p, e.z0), v(q, e.z0), v(q, e.z1));
      tri(v(p, e.z0), v(q, e.z1), v(p, e.z1));
      out.edges.push(...v(p, e.z0), ...v(q, e.z0), ...v(p, e.z1), ...v(q, e.z1));
      if (e.shape !== 'round') out.edges.push(...v(p, e.z0), ...v(p, e.z1));
    });
  }
  return out;
}

/**
 * Edited elements as a patch for mergeModels: each keeps its record (properties, category, type) with the
 * identity, mark, level, bounds and volume its parameters now give.
 */
export function elementPatch(base: ParsedModel, items: Array<{ record: ElementRecord; element: ParamElement }>): ParsedModel {
  const pos: number[] = [], nor: number[] = [], ids: number[] = [], idx: number[] = [], ePos: number[] = [], eIds: number[] = [];
  const elements: ElementRecord[] = items.map(({ record, element }, i) => {
    const g = meshOfElement(element);
    const offset = pos.length / 3;
    pos.push(...g.positions);
    nor.push(...g.normals);
    for (let k = 0; k < g.positions.length / 3; k++) ids.push(i);
    idx.push(...g.indices.map((x) => x + offset));
    ePos.push(...g.edges);
    for (let k = 0; k < g.edges.length / 3; k++) eIds.push(i);
    let b: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < g.positions.length; k += 3) b = [Math.min(b[0], g.positions[k]), Math.min(b[1], g.positions[k + 1]), Math.min(b[2], g.positions[k + 2]), Math.max(b[3], g.positions[k]), Math.max(b[4], g.positions[k + 1]), Math.max(b[5], g.positions[k + 2])];
    return { ...record, index: i, globalId: element.id, mark: element.mark, level: element.level, bounds: b, volume: volumeOf(element), quantitySource: 'geometry' as const };
  });
  return {
    info: base.info,
    coordination: base.coordination,
    elements,
    mesh: { positions: new Float32Array(pos), normals: new Float32Array(nor), elementIds: new Float32Array(ids), indices: new Uint32Array(idx) },
    edges: { positions: new Float32Array(ePos), elementIds: new Float32Array(eIds) },
  };
}
