import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROADMAP, STOREYS, roadmapMarkdown } from '../src/home/roadmap';

describe('roadmap', () => {
  it('docs/roadmap.md is generated from the list (run npm run roadmap)', () => {
    expect(readFileSync(new URL('../../../docs/roadmap.md', import.meta.url), 'utf8')).toBe(roadmapMarkdown());
  });
  it('every item stands in exactly one storey of the building, and storeys exist only for items', () => {
    const placed = STOREYS.flatMap((s) => s.items);
    expect(new Set(placed).size).toBe(placed.length);
    expect([...placed].sort()).toEqual(ROADMAP.map((r) => r.id).sort());
  });
  it('a storey is drawn as its items stand (no planned work shown as built)', () => {
    for (const s of STOREYS) for (const id of s.items) expect(ROADMAP.find((r) => r.id === id)!.status, `${id} in ${s.id}`).toBe(s.status);
  });
  it('shipped items name their release; nothing else does', () => {
    for (const r of ROADMAP) expect(!!r.version, r.id).toBe(r.status === 'shipped');
  });
});
