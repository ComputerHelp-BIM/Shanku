import { describe, expect, it } from 'vitest';
import type { RevitExchange } from '@shanku/engine';
import { approvedOnly, exportSets } from '../src/lib/exportPlan';

const x: RevitExchange = {
  version: 1,
  units: 'mm',
  levels: [
    { name: 'Foundation', elevation: -2000, foundation: true },
    { name: 'L1', elevation: 0, foundation: false },
  ],
  elements: [
    { id: 'a', kind: 'beam', mark: 'B1', material: 'RCC', level: 'L1', z0: 2400, z1: 3000 },
    { id: 'b', kind: 'column', mark: 'C1', material: 'RCC', level: 'L1', z0: 0, z1: 3000 },
    { id: 'c', kind: 'footing', mark: 'F1', material: 'RCC', level: 'Foundation', z0: -2000, z1: -1500 },
    { id: 'd', kind: 'column', mark: 'C2', material: 'RCC', level: 'L1', z0: 0, z1: 3000 },
  ],
  skipped: [],
};

describe('Export to Revit review', () => {
  it('groups by level (drawing order) then kind (build order)', () => {
    expect(exportSets(x).map((s) => [s.level, s.kind, s.ids.length])).toEqual([
      ['Foundation', 'footing', 1],
      ['L1', 'column', 2],
      ['L1', 'beam', 1],
    ]);
  });
  it('sends only approved sets, and every level', () => {
    const y = approvedOnly(x, new Set(['L1|column']));
    expect(y.elements.map((e) => e.id)).toEqual(['a', 'c']);
    expect(y.levels).toHaveLength(2);
  });
});
