import { describe, expect, it } from 'vitest';
import { gridSpacing } from '../src/render/gridUnderlay';

describe('grid spacing', () => {
  it('is 10ⁿ metres with lines at least 8 px apart, every tenth line major', () => {
    expect(gridSpacing(0.05)).toMatchObject({ minor: 1, major: 10 }); // 20 px per metre
    expect(gridSpacing(0.2).minor).toBe(10); // 5 px per metre: 1 m would be too dense
    expect(gridSpacing(0.001).minor).toBe(0.01); // close in: 10 mm lines
    for (const mpp of [0.0003, 0.004, 0.07, 1.3, 25]) {
      const { minor } = gridSpacing(mpp);
      expect(minor / mpp).toBeGreaterThanOrEqual(8);
      expect(minor / mpp).toBeLessThan(80); // and not needlessly sparse
      expect(Math.log10(minor) % 1).toBeCloseTo(0, 9);
    }
  });
  it('fades minor lines in between 8 and 32 px apart', () => {
    expect(gridSpacing(1 / 8).minorFade).toBe(0); // exactly 8 px
    expect(gridSpacing(1 / 32).minorFade).toBe(1); // 32 px
    expect(gridSpacing(1 / 20).minorFade).toBeCloseTo(0.5, 5);
  });
});
