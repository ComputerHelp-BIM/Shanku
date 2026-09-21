/**
 * Feature edges of a triangle mesh: boundary edges plus edges where the two
 * adjacent faces meet at more than `angleDeg`. Coplanar triangulation edges
 * are dropped, so a box gives its 12 edges, not 18.
 *
 * `vertices` is web-ifc's interleaved layout: x,y,z,nx,ny,nz per vertex.
 * Positions are welded by rounding to `weld` (same unit as the input) because
 * web-ifc duplicates vertices per face. Returns segment endpoints, 6 floats per edge.
 */
export function featureEdges(vertices: Float32Array, indices: Uint32Array, angleDeg = 30, weld = 1e-5, stride = 6): Float32Array {
  const vCount = vertices.length / stride;
  const weldId = new Uint32Array(vCount);
  const firstOfId: number[] = [];
  const keyToId = new Map<string, number>();
  const inv = 1 / weld;
  for (let v = 0; v < vCount; v++) {
    const o = v * stride;
    const key = `${Math.round(vertices[o] * inv)},${Math.round(vertices[o + 1] * inv)},${Math.round(vertices[o + 2] * inv)}`;
    let id = keyToId.get(key);
    if (id === undefined) {
      id = firstOfId.length;
      keyToId.set(key, id);
      firstOfId.push(v);
    }
    weldId[v] = id;
  }

  const cosLimit = Math.cos((angleDeg * Math.PI) / 180);
  const idCount = firstOfId.length;
  // edge key -> [nx, ny, nz, count, feature(0/1)]
  const edges = new Map<number, number[]>();
  const n = [0, 0, 0];

  const faceNormal = (a: number, b: number, c: number) => {
    const ax = vertices[a * stride], ay = vertices[a * stride + 1], az = vertices[a * stride + 2];
    const ux = vertices[b * stride] - ax, uy = vertices[b * stride + 1] - ay, uz = vertices[b * stride + 2] - az;
    const vx = vertices[c * stride] - ax, vy = vertices[c * stride + 1] - ay, vz = vertices[c * stride + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    n[0] = nx; n[1] = ny; n[2] = nz;
  };

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ia = weldId[a], ib = weldId[b], ic = weldId[c];
    if (ia === ib || ib === ic || ia === ic) continue; // degenerate
    faceNormal(a, b, c);
    const pairs: Array<[number, number]> = [[ia, ib], [ib, ic], [ic, ia]];
    for (const [p, q] of pairs) {
      const lo = p < q ? p : q;
      const hi = p < q ? q : p;
      const key = lo * idCount + hi;
      const e = edges.get(key);
      if (!e) {
        edges.set(key, [n[0], n[1], n[2], 1, 0]);
      } else {
        e[3] += 1;
        if (e[0] * n[0] + e[1] * n[1] + e[2] * n[2] < cosLimit) e[4] = 1;
      }
    }
  }

  const out: number[] = [];
  for (const [key, e] of edges) {
    if (e[3] !== 1 && e[4] !== 1) continue;
    const lo = Math.floor(key / idCount);
    const hi = key - lo * idCount;
    const p = firstOfId[lo] * stride;
    const q = firstOfId[hi] * stride;
    out.push(vertices[p], vertices[p + 1], vertices[p + 2], vertices[q], vertices[q + 1], vertices[q + 2]);
  }
  return new Float32Array(out);
}
