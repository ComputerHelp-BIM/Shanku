import { describe, expect, it } from 'vitest';
import { tempDims } from '../src/render/tempDims';

const rect = (x: number, y: number, w: number, h: number): [number, number, number, number][] => [
  [x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y],
];

describe('temporary dimensions (2D)', () => {
  it('sizes a rectangle and measures to the nearest parallel line outside it', () => {
    const others = [[-500, -1000, -500, 2000], [-900, -1000, -900, 2000], [0, 1500, 300, 1500]] as [number, number, number, number][];
    const dims = tempDims([rect(0, 0, 230, 500)], (v) => others.forEach(v), 5000);
    const sizes = dims.filter((d) => d.kind === 'size').map((d) => Math.round(d.value)).sort((a, b) => a - b);
    expect(sizes).toEqual([230, 500]);
    const clear = dims.filter((d) => d.kind === 'clear').map((d) => Math.round(d.value)).sort((a, b) => a - b);
    expect(clear).toContain(500); // left edge (x = 0) to the nearer line at x = -500, not -900
    expect(clear).toContain(1000); // top edge (y = 500) to the line at y = 1500
  });

  it('measures between two selected parallel lines', () => {
    const d = tempDims([[[0, 0, 1000, 0]], [[0, 350, 1000, 350]]], () => undefined, 5000);
    expect(d).toHaveLength(1);
    expect(d[0].value).toBeCloseTo(350);
  });
});
