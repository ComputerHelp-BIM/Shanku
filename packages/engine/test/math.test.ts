import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { featureEdges } from '../src/ifc/edges';
import { orbitAround, wheelZoomFactor, worldPerPixel } from '../src/render/cameraMath';
import { parseCssColor } from '../src/render/cssColor';
import { decodePickId, encodePickId, MAX_PICKABLE } from '../src/render/pickId';

describe('pick ids', () => {
  it('round-trips indices through 24-bit RGB, with 0 reserved for nothing', () => {
    for (const i of [0, 1, 255, 256, 65535, 65536, 49_999, MAX_PICKABLE - 1]) {
      expect(decodePickId(...encodePickId(i))).toBe(i);
    }
    expect(decodePickId(0, 0, 0)).toBeNull();
  });
});

describe('camera math', () => {
  const up = new Vector3(0, 1, 0);
  it('orbits rigidly about the pivot', () => {
    const pos = new Vector3(10, 10, 10);
    const tgt = new Vector3(0, 0, 0);
    const pivot = new Vector3(0, 0, 0);
    const r = orbitAround(pos, tgt, pivot, up, Math.PI / 2, 0);
    expect(r.position.distanceTo(pivot)).toBeCloseTo(pos.distanceTo(pivot), 6);
    expect(r.position.y).toBeCloseTo(10, 6);
  });
  it('never flips over the pole', () => {
    const r = orbitAround(new Vector3(0, 10, 0.01), new Vector3(), new Vector3(), up, 0, 10);
    const dir = new Vector3().subVectors(r.target, r.position).normalize();
    expect(Math.abs(dir.y)).toBeLessThan(1);
  });
  it('zooms in for negative wheel delta and scales pan with zoom', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(worldPerPixel(10, 2, 500)).toBeCloseTo(0.01, 9);
  });
});

describe('css colours', () => {
  it('parses token formats', () => {
    expect(parseCssColor('#D9761E')).toEqual({ r: 217 / 255, g: 118 / 255, b: 30 / 255, a: 1 });
    expect(parseCssColor(' rgba(231,227,219,0.30) ')?.a).toBeCloseTo(0.3);
    expect(parseCssColor('#fff')?.r).toBe(1);
    expect(parseCssColor('tomato')).toBeNull();
  });
});

describe('feature edges', () => {
  it('returns the 12 edges of a box, not its triangulation diagonals', () => {
    // Unit cube, 24 vertices (per-face, like web-ifc), stride 6.
    const faces = [
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
      [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
      [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
      [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
      [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]],
      [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    ];
    const v: number[] = [];
    const idx: number[] = [];
    faces.forEach((f, fi) => {
      for (const p of f) v.push(p[0], p[1], p[2], 0, 0, 0);
      const b = fi * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const e = featureEdges(new Float32Array(v), new Uint32Array(idx));
    expect(e.length / 6).toBe(12);
  });
});

describe('orbit at the poles (regression: camera froze at top and bottom)', () => {
  it('turns the view when looking straight down', async () => {
    const { Quaternion: Q, Vector3: V } = await import('three');
    const { orbitAround } = await import('../src/render/cameraMath');
    const up = new V(0, 1, 0);
    const pos = new V(0, 10, 0), target = new V(0, 0, 0);
    const camQ = new Q(); // camera right = +X
    const r = orbitAround(pos, target, target, up, 0.5, 0, new V(1, 0, 0).applyQuaternion(camQ));
    const newRight = new V(1, 0, 0).applyQuaternion(camQ.clone().premultiply(r.rotation));
    expect(newRight.angleTo(new V(1, 0, 0))).toBeCloseTo(0.5, 5); // the plan view spins
    const down = orbitAround(pos, target, target, up, 0, -0.3, new V(1, 0, 0));
    expect(down.position.y).toBeLessThan(10); // and can tilt away from the pole
    expect(down.position.distanceTo(target)).toBeCloseTo(10, 5);
  });

  it('tilts over the top instead of stopping there (no more stuck at the poles)', async () => {
    const { Vector3: V } = await import('three');
    const { orbitAround } = await import('../src/render/cameraMath');
    const target = new V(0, 0, 0);
    // camera just in front of straight-down; tilting further carries it over to the other side
    const r = orbitAround(new V(0, 10, 0.5), target, target, new V(0, 1, 0), 0, -0.3, new V(1, 0, 0));
    expect(r.position.z).toBeLessThan(0);
    expect(r.position.distanceTo(target)).toBeCloseTo(Math.hypot(10, 0.5), 5);
  });

  it('reverses horizontal drags when upside down', async () => {
    const { Vector3: V } = await import('three');
    const { orbitAround } = await import('../src/render/cameraMath');
    const t = new V(0, 0, 0), p = new V(0, 0, 10), up = new V(0, 1, 0);
    const a = orbitAround(p, t, t, up, 0.4, 0, new V(1, 0, 0), false).position.x;
    const b = orbitAround(p, t, t, up, 0.4, 0, new V(1, 0, 0), true).position.x;
    expect(Math.sign(a)).toBe(-Math.sign(b));
  });
});
