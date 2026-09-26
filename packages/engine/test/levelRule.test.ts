import { describe, expect, it } from 'vitest';
import { assignLevels, levelOf, type LevelHeight } from '../src/model/levelRule';
import { runChecks } from '../src/qa/checks';
import type { ElementRecord, ParsedModel } from '../src/model/types';

const L: LevelHeight[] = [
  { name: 'Level 1', y: 0 },
  { name: 'Level 2', y: 3 },
  { name: 'Level 3', y: 6 },
];
const el = (category: string, bottom: number, top: number, extra: Partial<ElementRecord> = {}) =>
  ({ index: 0, globalId: 'g', expressId: 1, ifcClass: `Ifc${category}`, name: '', typeName: '', mark: '', grade: '', volume: null, area: null, length: null, dims: { length: null, width: null, depth: null, height: null }, category, level: '', bounds: [0, bottom, 0, 1, top, 1], ...extra }) as unknown as ElementRecord;

describe('one level definition: the lowest level at or above the top', () => {
  it('columns and walls: the level they rise to', () => {
    expect(levelOf(el('Column', 3, 6), L)).toBe('Level 3'); // Level 2 -> Level 3 (Revit files it under Level 2)
    expect(levelOf(el('Wall', 3, 5.4), L)).toBe('Level 3'); // top 600 below the level (a beam over it)
    expect(levelOf(el('Wall', 3, 4), L)).toBe('Level 3'); // free-standing 1 m wall on the Level 2 floor
  });
  it('beams and slabs: the level they hang from, sunk or with an upstand', () => {
    expect(levelOf(el('Slab', 5.875, 6), L)).toBe('Level 3');
    expect(levelOf(el('Beam', 3.9, 4.5), L)).toBe('Level 3'); // sunk 1500
    expect(levelOf(el('Beam', 5.7, 6.3), L)).toBe('Level 3'); // upstand 300 (within 600)
    expect(levelOf(el('Wall', 3, 6.3), L)).toBe('Level 3'); // walls do not get the upstand allowance: above Level 3 → highest
  });
  it('foundations: Level 1; above the highest level: the highest', () => {
    expect(levelOf(el('Footing', -2.15, -1.5), L)).toBe('Level 1');
    expect(levelOf(el('Column', -1.5, 0), L)).toBe('Level 1'); // pedestal up to ±0
    expect(levelOf(el('Wall', 6, 7), L)).toBe('Level 3'); // roof parapet
  });

  it('applied to a model: storey kept, counts follow, a stale CH-LEVEL is flagged by QA', () => {
    const model = {
      info: { units: { length: 'mm' }, levels: [{ name: 'Level 2', elevation: 3000, elementCount: 2 }, { name: 'Level 3', elevation: 6000, elementCount: 0 }] },
      elements: [
        el('Column', 3, 6, { level: 'Level 2', globalId: 'c', chLevel: 'Level 3', mark: 'C1' }), // Revit: base level
        el('Column', 3, 6, { level: 'Level 2', globalId: 'd', chLevel: 'Level 2', mark: 'C2' }), // copied, label not updated
      ],
      coordination: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    } as unknown as ParsedModel;
    model.elements.forEach((e, i) => (e.index = i));
    assignLevels(model);
    expect(model.elements.map((e) => [e.storey, e.level])).toEqual([
      ['Level 2', 'Level 3'],
      ['Level 2', 'Level 3'],
    ]);
    expect(model.info.levels.map((l) => l.elementCount)).toEqual([0, 2]);
    const f = runChecks({ elements: model.elements, levels: model.info.levels }).findings.filter((x) => x.checkId === 'level-label');
    expect(f).toHaveLength(1);
    expect(f[0].title).toBe('CH-LEVEL says Level 2, the top is at Level 3');
    expect(f[0].elements).toEqual([1]);
  });

  it('a file whose levels are floors keeps its own storeys', async () => {
    const { conventionOf } = await import('../src/model/levelRule');
    // floors at 0 and 3.2; the upper storey rises to 6.4 with no level there
    const floorsOnly: LevelHeight[] = [{ name: 'Level 1', y: 0 }, { name: 'Level 2', y: 3.2 }];
    const els = [el('Column', 0, 3.05), el('Slab', 3.05, 3.2), el('Column', 3.2, 6.25), el('Slab', 6.25, 6.4)];
    expect(conventionOf({ elements: els }, floorsOnly)).toBe('floor');
    // the same building with a level at the roof reads by its tops; a parapet alone does not flip it
    const withRoof: LevelHeight[] = [...floorsOnly, { name: 'Roof', y: 6.4 }];
    const building = Array.from({ length: 10 }, () => els).flat(); // 40 elements, two storeys
    expect(conventionOf({ elements: [...building, el('Wall', 6.4, 7.4), el('Wall', 6.4, 7.4)] }, withRoof)).toBe('top'); // 2 parapets of 42
  });

  it('the project ±0 comes from the geometry, whatever an exporter or web-ifc moved', async () => {
    const { projectZeroY, levelHeightsOf } = await import('../src/model/levelRule');
    // Revit-style filing (columns and walls by their base, beams and slabs by their level), with the
    // whole model sitting 2.94 m off in the viewer and no attribute saying so
    const dy = -2.94;
    const on = (storey: string, cat: string, b: number, t: number) => el(cat, b + dy, t + dy, { storey, level: storey });
    const model = {
      info: { units: { length: 'mm' }, levels: [{ name: 'Level 1', elevation: 0, elementCount: 0 }, { name: 'Level 2', elevation: 3000, elementCount: 0 }, { name: 'Level 3', elevation: 6000, elementCount: 0 }] },
      elements: [on('Level 1', 'Column', 0, 3), on('Level 1', 'Wall', 0, 2.4), on('Level 2', 'Beam', 2.4, 3), on('Level 2', 'Slab', 2.875, 3), on('Level 2', 'Column', 3, 6), on('Level 3', 'Beam', 5.4, 6), on('Level 3', 'Slab', 5.875, 6)],
      coordination: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -11.82, 0, 1], // what web-ifc reports need not match
    } as unknown as ParsedModel;
    expect(projectZeroY(model)).toBeCloseTo(dy, 6);
    expect(levelHeightsOf(model).map((l) => +l.y.toFixed(3))).toEqual([-2.94, 0.06, 3.06]);
    assignLevels(model);
    expect(model.elements.map((e) => `${e.category} ${e.storey}->${e.level}`)).toEqual([
      'Column Level 1->Level 2',
      'Wall Level 1->Level 2',
      'Beam Level 2->Level 2',
      'Slab Level 2->Level 2',
      'Column Level 2->Level 3',
      'Beam Level 3->Level 3',
      'Slab Level 3->Level 3',
    ]);
  });
});
