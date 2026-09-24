import { describe, expect, it } from 'vitest';
import { FIGURES } from '../src/components/figures';
import { GUIDE } from '../src/lib/guide';

describe('guide figures', () => {
  const blocks = GUIDE.flatMap((s) => s.blocks.map((b) => ({ s: s.id, b })));
  const figs = blocks.filter(({ b }) => 'figure' in b) as Array<{ s: string; b: { figure: keyof typeof FIGURES; alt: string } }>;

  it('every figure the guide uses exists, with a description for search and screen readers', () => {
    expect(figs.length).toBeGreaterThanOrEqual(11);
    for (const { s, b } of figs) {
      expect(FIGURES[b.figure], `${s}: ${b.figure}`).toBeTypeOf('function');
      expect(b.alt.length, `${s}: ${b.figure} alt`).toBeGreaterThan(20);
    }
  });

  it('every figure is used somewhere in the guide', () => {
    const used = new Set(figs.map(({ b }) => b.figure));
    expect(Object.keys(FIGURES).filter((id) => !used.has(id as keyof typeof FIGURES))).toEqual([]);
  });
});
