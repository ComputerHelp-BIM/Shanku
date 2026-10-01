import { describe, expect, it } from 'vitest';
import type { ParamElement } from '../src/model/parametric';
import { elevationMm, followLevels, heightsOf, hostOf, infoLevels, rehost, withLevel, type LevelDatum } from '../src/model/hosting';
import { move } from '../src/edit/ops';

const L: LevelDatum[] = [{ name: 'Level 1', z: 0 }, { name: 'Level 2', z: 3000 }, { name: 'Level 3', z: 6000 }];
const el = (kind: ParamElement['kind'], z0: number, z1: number, level = 'Level 2', over: Partial<ParamElement> = {}): ParamElement => ({ id: kind, kind, mark: 'X', material: null, level, z0, z1, center: [0, 0], width: 300, length: 300, ...over });
const hosted = (e: ParamElement) => rehost(e, L);

describe('hosting: elements placed on levels, as in Revit', () => {
  it('columns span between levels; beams, slabs and footings hang from theirs', () => {
    expect(hostOf(el('column', 0, 3000), L)).toEqual({ base: { level: 'Level 1', offset: 0 }, top: { level: 'Level 2', offset: 0 } });
    expect(hostOf(el('column', 0, 2950), L)).toEqual({ base: { level: 'Level 1', offset: 0 }, top: { level: 'Level 2', offset: -50 } });
    expect(hostOf(el('beam', 2550, 3000), L)).toEqual({ base: { level: 'Level 2', offset: 0 } });
    expect(hostOf(el('slab', 2800, 2950), L)).toEqual({ base: { level: 'Level 2', offset: -50 } }); // a sunk slab
    expect(hostOf(el('footing', -2000, -1500, 'Level 1'), L)).toEqual({ base: { level: 'Level 1', offset: -1500 } });
    expect(hostOf(el('column', -1500, 3000), L)).toEqual({ base: { level: 'Level 1', offset: -1500 }, top: { level: 'Level 2', offset: 0 } }); // starts below the lowest level
    // ends at the lowest level (found on adani.ifc): base and top on Level 1, so raising Level 2 leaves it alone
    expect(hostOf(el('column', -1500, 0, 'Level 1'), L)).toEqual({ base: { level: 'Level 1', offset: -1500 }, top: { level: 'Level 1', offset: 0 } });
    expect(hostOf(el('wall', -4000, -650, 'Level 1'), L)).toEqual({ base: { level: 'Level 1', offset: -4000 }, top: { level: 'Level 1', offset: -650 } });
    expect(followLevels([rehost(el('column', -1500, 0, 'Level 1'), L)], withLevel(L, 'Level 2', 3300))).toEqual([]);
  });

  it('reproduces every element’s heights exactly from its hosting', () => {
    for (const e of [el('column', 0, 2950), el('beam', 2550, 3000), el('slab', 2800, 2950), el('footing', -2000, -1500, 'Level 1'), el('wall', 3000, 6000, 'Level 3')]) {
      expect(heightsOf(e, hostOf(e, L)!, L)).toEqual({ z0: e.z0, z1: e.z1 });
    }
  });

  it('a level moved: columns stretch, what hangs from it moves, the rest stays', () => {
    const els = [hosted(el('column', 0, 2950)), hosted({ ...el('beam', 2550, 3000), id: 'b' }), hosted({ ...el('slab', 2800, 2950), id: 's' }), hosted({ ...el('footing', -2000, -1500, 'Level 1'), id: 'f' })];
    const moved = followLevels(els, withLevel(L, 'Level 2', 3300));
    const by = Object.fromEntries(moved.map((e) => [e.id, [e.z0, e.z1]]));
    expect(by).toEqual({ column: [0, 3250], b: [2850, 3300], s: [3100, 3250] }); // the footing is not on Level 2
  });

  it('a vertical move changes offsets and keeps the host levels', () => {
    const c = hosted(el('column', 0, 3000));
    const up = rehost(move([c], 0, 0, 100).changed[0], L);
    expect(up.hosting).toEqual({ base: { level: 'Level 1', offset: 100 }, top: { level: 'Level 2', offset: 100 } });
    const b = hosted(el('beam', 2550, 3000));
    expect(rehost(move([b], 0, 0, -75).changed[0], L).hosting).toEqual({ base: { level: 'Level 2', offset: -75 } });
  });
});

it('writes levels back to the model in its own unit, from the calibrated ±0', () => {
  const model = { info: { units: { length: 'mm' } }, elements: [{ level: 'Level 2' }, { level: 'Level 2' }] } as never;
  // the viewer's ±0 at y = 0.5 m: a level at z 3500 mm in the parametric frame is +3000 in the file
  expect(infoLevels(model, [{ name: 'Level 2', z: 3500 }], 0.5)).toEqual([{ name: 'Level 2', elevation: 3000, elementCount: 2 }]);
  const metres = { info: { units: { length: 'm' } }, elements: [] } as never;
  expect(infoLevels(metres, [{ name: 'L', z: 3500 }], 0.5)[0].elevation).toBe(3);
  expect(elevationMm({ name: 'L', z: 3500 }, 0.5)).toBe(3000);
});
