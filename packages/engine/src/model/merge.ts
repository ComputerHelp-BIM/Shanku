/**
 * Live updates from Revit: a partial export of the changed elements (a "patch") is aligned to the
 * model's coordinate space and merged in. Unchanged elements keep their place; changed ones are
 * swapped in at the same position; deleted ones leave; new ones are appended. The old → new index map
 * lets the app carry selection, hides and overrides across.
 */
import type { ElementRecord, Level, ParsedModel } from './types';

type Mat4 = number[]; // column-major 4×4

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

/** Inverse of an affine matrix (rotation/scale + translation). */
function invertAffine(m: Mat4): Mat4 {
  const [a, b, c, , d, e, f, , g, h, i] = m; // columns: (a b c) (d e f) (g h i)
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
  if (!det) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const inv = [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, 0,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, 0,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det, 0,
    0, 0, 0, 1,
  ];
  const [tx, ty, tz] = [m[12], m[13], m[14]];
  inv[12] = -(inv[0] * tx + inv[4] * ty + inv[8] * tz);
  inv[13] = -(inv[1] * tx + inv[5] * ty + inv[9] * tz);
  inv[14] = -(inv[2] * tx + inv[6] * ty + inv[10] * tz);
  return inv;
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const isIdentity = (m: Mat4) => m.every((v, k) => Math.abs(v - IDENTITY[k]) < 1e-12);

/**
 * Maps a patch into the base model's space. web-ifc shifted each file to the origin by its own
 * amount; base × inverse(patch) undoes the patch's shift and applies the model's.
 */
export function alignPatch(patch: ParsedModel, baseCoordination: Mat4 | undefined): ParsedModel {
  const t = mul(baseCoordination ?? IDENTITY, invertAffine(patch.coordination ?? IDENTITY));
  if (isIdentity(t)) return patch;
  const point = (arr: Float32Array) => {
    const out = new Float32Array(arr.length);
    for (let k = 0; k < arr.length; k += 3) {
      const x = arr[k], y = arr[k + 1], z = arr[k + 2];
      out[k] = t[0] * x + t[4] * y + t[8] * z + t[12];
      out[k + 1] = t[1] * x + t[5] * y + t[9] * z + t[13];
      out[k + 2] = t[2] * x + t[6] * y + t[10] * z + t[14];
    }
    return out;
  };
  const dir = (arr: Float32Array) => {
    const out = new Float32Array(arr.length);
    for (let k = 0; k < arr.length; k += 3) {
      const x = arr[k], y = arr[k + 1], z = arr[k + 2];
      const nx = t[0] * x + t[4] * y + t[8] * z, ny = t[1] * x + t[5] * y + t[9] * z, nz = t[2] * x + t[6] * y + t[10] * z;
      const l = Math.hypot(nx, ny, nz) || 1;
      out[k] = nx / l;
      out[k + 1] = ny / l;
      out[k + 2] = nz / l;
    }
    return out;
  };
  const box = (b: ElementRecord['bounds']): ElementRecord['bounds'] => {
    const xs: number[] = [], ys: number[] = [], zs: number[] = [];
    for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
      xs.push(t[0] * x + t[4] * y + t[8] * z + t[12]);
      ys.push(t[1] * x + t[5] * y + t[9] * z + t[13]);
      zs.push(t[2] * x + t[6] * y + t[10] * z + t[14]);
    }
    return [Math.min(...xs), Math.min(...ys), Math.min(...zs), Math.max(...xs), Math.max(...ys), Math.max(...zs)];
  };
  return {
    ...patch,
    coordination: baseCoordination,
    elements: patch.elements.map((e) => ({ ...e, bounds: box(e.bounds) })),
    mesh: { ...patch.mesh, positions: point(patch.mesh.positions), normals: dir(patch.mesh.normals) },
    edges: { ...patch.edges, positions: point(patch.edges.positions) },
  };
}

export interface MergeResult {
  model: ParsedModel;
  /** Old index → new index, for elements still in the model (replaced ones map to their update). */
  indexMap: Map<number, number>;
  replaced: number;
  added: number;
  removed: number;
}

/**
 * Merges an aligned patch into the model. `deleted` are GlobalIds removed in Revit. Elements of the
 * patch take `source` (the patch's slot in the IFC worker, for their properties).
 */
export function mergeModels(base: ParsedModel, patch: ParsedModel, deleted: readonly string[], source: number): MergeResult {
  const byGid = new Map(patch.elements.map((e) => [e.globalId, e]));
  const gone = new Set(deleted);
  const elements: ElementRecord[] = [];
  const indexMap = new Map<number, number>();
  const patchNew = new Map<number, number>(); // patch index → new index
  let replaced = 0;
  let removed = 0;
  for (const e of base.elements) {
    const up = byGid.get(e.globalId);
    if (up) {
      const at = elements.length;
      elements.push({ ...up, index: at, source });
      indexMap.set(e.index, at);
      patchNew.set(up.index, at);
      byGid.delete(e.globalId);
      replaced++;
    } else if (gone.has(e.globalId)) {
      removed++;
    } else {
      const at = elements.length;
      elements.push(e.index === at ? e : { ...e, index: at });
      indexMap.set(e.index, at);
    }
  }
  let added = 0;
  for (const up of patch.elements) {
    if (!byGid.has(up.globalId)) continue; // already placed
    const at = elements.length;
    elements.push({ ...up, index: at, source });
    patchNew.set(up.index, at);
    added++;
  }

  // Mesh: base vertices of kept elements (re-indexed), then the patch's.
  // GlobalIds the patch brings: their old geometry is dropped in favour of the patch's.
  const byGidSet = new Set(patch.elements.map((e) => e.globalId));
  const bm = base.mesh, pm = patch.mesh;
  const vKeep = new Int32Array(bm.elementIds.length).fill(-1);
  let vCount = 0;
  for (let v = 0; v < bm.elementIds.length; v++) {
    const old = bm.elementIds[v];
    if (!byGidSet.has(base.elements[old].globalId) && indexMap.has(old)) vKeep[v] = vCount++;
  }
  const total = vCount + pm.elementIds.length;
  const positions = new Float32Array(total * 3), normals = new Float32Array(total * 3), elementIds = new Float32Array(total);
  for (let v = 0; v < vKeep.length; v++) {
    const nv = vKeep[v];
    if (nv < 0) continue;
    positions.set(bm.positions.subarray(v * 3, v * 3 + 3), nv * 3);
    normals.set(bm.normals.subarray(v * 3, v * 3 + 3), nv * 3);
    elementIds[nv] = indexMap.get(bm.elementIds[v])!;
  }
  positions.set(pm.positions, vCount * 3);
  normals.set(pm.normals, vCount * 3);
  for (let v = 0; v < pm.elementIds.length; v++) elementIds[vCount + v] = patchNew.get(pm.elementIds[v]) ?? 0;
  const tris: number[] = [];
  for (let k = 0; k < bm.indices.length; k += 3) {
    const a = vKeep[bm.indices[k]];
    if (a < 0) continue;
    tris.push(a, vKeep[bm.indices[k + 1]], vKeep[bm.indices[k + 2]]);
  }
  const indices = new Uint32Array(tris.length + pm.indices.length);
  indices.set(tris);
  for (let k = 0; k < pm.indices.length; k++) indices[tris.length + k] = pm.indices[k] + vCount;

  // Edges: segments of kept elements, then the patch's.
  const be = base.edges, pe = patch.edges;
  const segs: number[] = [], segEl: number[] = [];
  for (let s = 0; s < be.elementIds.length; s += 2) {
    const old = be.elementIds[s];
    if (byGidSet.has(base.elements[old].globalId) || !indexMap.has(old)) continue;
    const at = indexMap.get(old)!;
    for (let k = 0; k < 6; k++) segs.push(be.positions[s * 3 + k]);
    segEl.push(at, at);
  }
  for (let s = 0; s < pe.elementIds.length; s++) {
    segEl.push(patchNew.get(pe.elementIds[s]) ?? 0);
  }
  const edgePositions = new Float32Array(segs.length + pe.positions.length);
  edgePositions.set(segs);
  edgePositions.set(pe.positions, segs.length);

  // Info: counts, levels and bounds from the merged elements.
  const levels: Level[] = base.info.levels.map((l) => ({ ...l, elementCount: 0 }));
  for (const l of patch.info.levels) if (!levels.some((x) => x.name === l.name)) levels.push({ ...l, elementCount: 0 });
  const categories: ParsedModel['info']['categories'] = {};
  const b: ParsedModel['info']['bounds'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const e of elements) {
    let l = levels.find((x) => x.name === e.level);
    if (!l && e.level) levels.push((l = { name: e.level, elevation: null, elementCount: 0 })); // a level only the update knows
    if (l) l.elementCount++;
    categories[e.category] = (categories[e.category] ?? 0) + 1;
    for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k], e.bounds[k]);
      b[k + 3] = Math.max(b[k + 3], e.bounds[k + 3]);
    }
  }
  const model: ParsedModel = {
    ...base,
    info: {
      ...base.info,
      levels,
      categories: Object.fromEntries(Object.keys(base.info.categories).concat(Object.keys(categories)).filter((c, i, a) => a.indexOf(c) === i && categories[c as keyof typeof categories]).map((c) => [c, categories[c as keyof typeof categories]])),
      elementCount: elements.length,
      vertexCount: total,
      triangleCount: indices.length / 3,
      edgeCount: edgePositions.length / 6,
      bounds: elements.length ? b : base.info.bounds,
    },
    elements,
    mesh: { positions, normals, elementIds, indices },
    edges: { positions: edgePositions, elementIds: new Float32Array(segEl) },
    revision: (base.revision ?? 0) + 1,
  };
  return { model, indexMap, replaced, added, removed };
}
