import { describe, expect, it } from 'vitest';
import type { ElementRecord } from '@shanku/engine';
import { looksLikeMarks, matchMarks, parseMarkList, proposeMarks } from '../src/lib/marks';

const el = (index: number, category: string, mark: string, level = 'L1', x = 0, z = 0): ElementRecord =>
  ({ index, category, mark, level, bounds: [x, 0, z, x + 0.4, 3, z + 0.4] }) as unknown as ElementRecord;

describe('pasted mark lists', () => {
  it('reads WhatsApp-style lists, ranges and "to"', () => {
    expect(parseMarkList('Please check C1, C4 and b12.\nAlso C7')).toEqual(['PLEASE', 'CHECK', 'C1', 'C4', 'B12', 'ALSO', 'C7']);
    expect(parseMarkList('C1-C4')).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(parseMarkList('B10 to B12; (C2)')).toEqual(['B10', 'B11', 'B12', 'C2']);
    expect(parseMarkList('C1-C99999')).toEqual(['C1-C99999']); // a silly range is not expanded
    expect(looksLikeMarks('C1, C4')).toBe(true);
    expect(looksLikeMarks('hello there')).toBe(false);
  });

  it('matches every instance of a mark, ignoring case and hyphens, and lists the rest', () => {
    const els = [el(0, 'Column', 'C1'), el(1, 'Column', 'C1', 'L2'), el(2, 'Beam', 'B-12'), el(3, 'Column', '')];
    const r = matchMarks(els, parseMarkList('please c1, B12, C99'));
    expect(r.indices).toEqual([0, 1, 2]);
    expect(r.found).toEqual(['C1', 'B12']);
    expect(r.unknown).toEqual(['PLEASE', 'C99']);
  });
});

describe('proposed marks', () => {
  it('continues the model numbering, lowest level first, back to front, left to right', () => {
    const els = [el(0, 'Column', 'C1'), el(1, 'Column', 'C12'), el(2, 'Column', '', 'L2', 5, 0), el(3, 'Column', '', 'L1', 5, 0), el(4, 'Column', '', 'L1', 0, 0), el(5, 'Beam', '')];
    expect(proposeMarks(els, [2, 3, 4, 5], ['L1', 'L2'])).toEqual([
      { index: 4, mark: 'C13' },
      { index: 3, mark: 'C14' },
      { index: 2, mark: 'C15' },
      { index: 5, mark: 'B1' },
    ]);
  });

  it('skips elements that already have a mark', () => {
    expect(proposeMarks([el(0, 'Column', 'C1')], [0])).toEqual([]);
  });
});
