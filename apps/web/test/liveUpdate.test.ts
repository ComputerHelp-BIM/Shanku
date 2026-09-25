import { describe, expect, it } from 'vitest';
import { NO_CHANGES, addChanges, changeCount, remapIndices, remapRecord, toExport, withoutMerged } from '../src/lib/liveUpdate';

describe('live updates from Revit', () => {
  it('piles up changes the way Revit makes them', () => {
    let c = addChanges(NO_CHANGES, { modified: ['a'], added: ['n'], deleted: [] });
    c = addChanges(c, { modified: ['a', 'n'], added: [], deleted: ['b'] });
    expect(c).toEqual({ modified: ['a'], added: ['n'], deleted: ['b'] }); // n stays "added"
    c = addChanges(c, { modified: [], added: [], deleted: ['n', 'a'] });
    expect(c).toEqual({ modified: [], added: [], deleted: ['b', 'a'] }); // n came and went; a is gone
    expect(changeCount(c)).toBe(2);
    expect(toExport(addChanges(NO_CHANGES, { modified: ['x'], added: ['y'], deleted: ['z'] }))).toEqual(['x', 'y']);
  });

  it('keeps changes that arrive during a merge', () => {
    const merged = { modified: ['a'], added: [], deleted: [] };
    const now = addChanges(merged, { modified: ['c'], added: [], deleted: [] });
    expect(withoutMerged(now, merged)).toEqual({ modified: ['c'], added: [], deleted: [] });
  });

  it('carries per-element state to new positions', () => {
    const map = new Map([[0, 0], [1, 1], [3, 2]]); // element 2 was deleted
    expect(remapIndices(map, [3, 2, 0])).toEqual([2, 0]);
    expect(remapRecord(map, { 1: 'red', 2: 'blue', 3: 'green' })).toEqual({ 1: 'red', 2: 'green' });
  });
});
