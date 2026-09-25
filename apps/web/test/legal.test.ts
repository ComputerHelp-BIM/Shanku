import { describe, expect, it } from 'vitest';
import { asOf, disclaimer, TRADEMARK_NOTICE } from '../src/lib/legal';

describe('legal notice', () => {
  it('names the marks, their owner and Shanku’s independence', () => {
    for (const s of ['Autodesk, Revit and AutoCAD', 'trademarks of Autodesk, Inc.', 'independent software application developed by Computer Help', 'not affiliated with, sponsored by, or endorsed by Autodesk, Inc.']) expect(TRADEMARK_NOTICE).toContain(s);
  });
  it('dates the features and compatibility data by month', () => {
    const d = new Date('2026-09-25T10:00:00Z');
    expect(asOf(d)).toBe('September 2026');
    expect(disclaimer(d)).toMatch(/^Disclaimer: Autodesk, Revit and AutoCAD .* accurate as of September 2026\.$/);
  });
});
