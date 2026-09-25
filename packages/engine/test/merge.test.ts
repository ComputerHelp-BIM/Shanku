import { describe, expect, it } from 'vitest';
import { alignPatch, mergeModels } from '../src/model/merge';
import type { ElementRecord, ParsedModel } from '../src/model/types';

/** A model of unit cubes (one triangle and one edge each, enough to track), at x = offsets. */
function model(items: Array<{ gid: string; x: number; level?: string }>, coordination?: number[]): ParsedModel {
  const positions: number[] = [], normals: number[] = [], elementIds: number[] = [], indices: number[] = [], edgePos: number[] = [], edgeEl: number[] = [];
  const elements = items.map((it, i) => {
    const base = positions.length / 3;
    positions.push(it.x, 0, 0, it.x + 1, 0, 0, it.x, 1, 0);
    normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
    elementIds.push(i, i, i);
    indices.push(base, base + 1, base + 2);
    edgePos.push(it.x, 0, 0, it.x + 1, 0, 0);
    edgeEl.push(i, i);
    return { index: i, expressId: 100 + i, globalId: it.gid, ifcClass: 'IfcColumn', category: 'Column', name: it.gid, tag: '', typeName: 'C', level: it.level ?? 'L1', mark: it.gid, markSource: '', grade: '', gradeSource: '', volume: 1, area: null, length: null, quantitySource: 'geometry', dims: { length: null, width: null, depth: null, height: null }, bounds: [it.x, 0, 0, it.x + 1, 1, 0] } as unknown as ElementRecord;
  });
  return {
    info: { fileName: 'm.ifc', levels: [{ name: 'L1', elevation: 0, elementCount: elements.length }], categories: { Column: elements.length }, elementCount: elements.length, vertexCount: positions.length / 3, triangleCount: indices.length / 3, edgeCount: edgePos.length / 6, bounds: [0, 0, 0, 1, 1, 0] } as unknown as ParsedModel['info'],
    elements,
    mesh: { positions: new Float32Array(positions), normals: new Float32Array(normals), elementIds: new Float32Array(elementIds), indices: new Uint32Array(indices) },
    edges: { positions: new Float32Array(edgePos), elementIds: new Float32Array(edgeEl) },
    coordination,
  };
}
const xOf = (m: ParsedModel, gid: string) => {
  const i = m.elements.findIndex((e) => e.globalId === gid);
  const v = [...m.mesh.elementIds].indexOf(i);
  return m.mesh.positions[v * 3];
};

describe('live updates: merging a partial export', () => {
  it('replaces changed elements in place, removes deleted, appends new, maps old indices', () => {
    const base = model([{ gid: 'a', x: 0 }, { gid: 'b', x: 10 }, { gid: 'c', x: 20 }, { gid: 'd', x: 30 }]);
    const patch = model([{ gid: 'b', x: 15 }, { gid: 'n', x: 50, level: 'L2' }]);
    const r = mergeModels(base, patch, ['c'], 1);
    expect(r.model.elements.map((e) => e.globalId)).toEqual(['a', 'b', 'd', 'n']);
    expect(r.model.elements.map((e) => e.index)).toEqual([0, 1, 2, 3]);
    expect(r.model.elements[1].source).toBe(1); // properties come from the patch file
    expect(r.model.elements[0].source).toBeUndefined();
    expect([...r.indexMap.entries()]).toEqual([[0, 0], [1, 1], [3, 2]]); // c (2) is gone
    expect([r.replaced, r.added, r.removed]).toEqual([1, 1, 1]);
    // geometry: b moved, c gone, d re-indexed, n added
    expect(xOf(r.model, 'b')).toBe(15);
    expect(xOf(r.model, 'd')).toBe(30);
    expect(xOf(r.model, 'n')).toBe(50);
    expect(r.model.info.triangleCount).toBe(4);
    expect(r.model.info.edgeCount).toBe(4);
    expect(Math.max(...r.model.mesh.indices)).toBe(r.model.info.vertexCount - 1);
    expect(r.model.info.levels.map((l) => [l.name, l.elementCount])).toEqual([['L1', 3], ['L2', 1]]);
    expect(r.model.revision).toBe(1);
    // every triangle's vertices belong to one element
    for (let k = 0; k < r.model.mesh.indices.length; k += 3) {
      const ids = [0, 1, 2].map((j) => r.model.mesh.elementIds[r.model.mesh.indices[k + j]]);
      expect(new Set(ids).size).toBe(1);
    }
  });

  it('aligns a patch that web-ifc shifted by a different amount', () => {
    // model shifted by -1000 in x; the patch file (fewer elements) by -1015
    const shift = (tx: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1];
    const patch = model([{ gid: 'b', x: 0 }], shift(-1015)); // at raw x = 1015
    const aligned = alignPatch(patch, shift(-1000)); // in the model's space: 1015 - 1000 = 15
    expect(aligned.mesh.positions[0]).toBeCloseTo(15);
    expect(aligned.elements[0].bounds[0]).toBeCloseTo(15);
    expect(aligned.edges.positions[0]).toBeCloseTo(15);
    expect(alignPatch(patch, patch.coordination)).toBe(patch); // same shift: untouched
  });
});
