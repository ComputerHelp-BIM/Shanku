import { describe, expect, it } from 'vitest';
import type { ParamElement } from '../src/model/parametric';
import { align, arrayLinear, copy, mirror, move, offset, pin, remove, rotate } from '../src/edit/ops';
import { changeOf, commit, emptyHistory, redo, undo } from '../src/edit/history';
import { newGlobalId } from '../src/edit/ids';

const col = (over: Partial<ParamElement> = {}): ParamElement => ({ id: 'c1', kind: 'column', mark: 'C1', material: 'M25', level: 'Level 2', z0: 0, z1: 3000, shape: 'rect', center: [1000, 0], width: 300, length: 600, angle: 0, ...over });
const beam = (over: Partial<ParamElement> = {}): ParamElement => ({ id: 'b1', kind: 'beam', mark: 'B1', material: 'M25', level: 'Level 2', z0: 2550, z1: 3000, start: [0, 0], end: [4000, 0], thickness: 230, depth: 450, ...over });
const slab = (): ParamElement => ({ id: 's1', kind: 'slab', mark: 'S1', material: 'M25', level: 'Level 2', z0: 2850, z1: 3000, outline: [[0, 0], [4000, 0], [4000, 3000], [0, 3000]], thickness: 150 });
let n = 0;
const ids = () => `new${++n}`;

describe('Modify operations', () => {
  it('Move: plan and height; pinned elements are refused', () => {
    const r = move([col(), col({ id: 'c2', pinned: true })], 500, -200, 100);
    expect(r.changed).toEqual([col({ center: [1500, -200], z0: 100, z1: 3100 })]);
    expect(r.refused).toEqual([{ id: 'c2', reason: 'pinned (Unpin it first)' }]);
  });

  it('Rotate 90° about the origin: positions and angles', () => {
    const r = rotate([col(), beam()], 90, [0, 0]);
    expect(r.changed[0]).toMatchObject({ center: [0, 1000], angle: 90 });
    expect(r.changed[1]).toMatchObject({ start: [0, 0], end: [0, 4000] });
  });

  it('Mirror about a vertical axis: a copy by default, angles mirrored, outlines stay counter-clockwise', () => {
    const r = mirror([col({ angle: 30 }), slab()], [0, 0], [0, 1], { newId: ids });
    expect(r.changed).toEqual([]);
    expect(r.created[0]).toMatchObject({ center: [-1000, 0], angle: 150, pinned: false });
    expect(r.created[0].id).not.toBe('c1');
    const o = r.created[1].outline!;
    expect(o.reduce((a, q, k) => a + (q[0] * o[(k + 1) % o.length][1] - o[(k + 1) % o.length][0] * q[1]), 0) / 2).toBeGreaterThan(0);
    expect(mirror([col()], [0, 0], [0, 1], { copy: false, newId: ids }).changed[0].center).toEqual([-1000, 0]);
  });

  it('Copy and Array: new ids, the right places', () => {
    expect(copy([col()], 0, 6000, 0, ids).created[0]).toMatchObject({ center: [1000, 6000] });
    const a = arrayLinear([col()], 3000, 0, 0, 4, ids);
    expect(a.created.map((e) => e.center)).toEqual([[4000, 0], [7000, 0], [10000, 0]]);
    expect(new Set(a.created.map((e) => e.id)).size).toBe(3);
    expect(arrayLinear([col()], 3000, 0, 0, 1, ids).refused[0].reason).toMatch(/2 or more/);
  });

  it('Offset: beams and walls parallel, to the left of start → end', () => {
    expect(offset([beam()], 500, { newId: ids }).changed[0]).toMatchObject({ start: [0, 500], end: [4000, 500] });
    expect(offset([beam()], -500, { copy: true, newId: ids }).created[0]).toMatchObject({ start: [0, -500], end: [4000, -500] });
    expect(offset([col()], 500, { newId: ids }).refused[0].reason).toMatch(/beams and walls/);
  });

  it('Align: centre or nearest face onto a reference line; beams must be parallel', () => {
    const grid: [[number, number], [number, number]] = [[0, 0], [0, 1]]; // the line x = 0
    expect(align([col()], ...grid, 'center').changed[0].center).toEqual([0, 0]);
    expect(align([col()], ...grid, 'face').changed[0].center).toEqual([150, 0]); // its 300 face on x = 0
    expect(align([beam({ start: [0, 700], end: [4000, 700] })], [0, 0], [1, 0], 'face').changed[0]).toMatchObject({ start: [0, 115], end: [4000, 115] });
    expect(align([beam()], ...grid, 'center').refused[0].reason).toBe('not parallel to the reference');
  });

  it('Pin and Delete', () => {
    expect(pin([col()], true).changed[0].pinned).toBe(true);
    expect(remove([col(), col({ id: 'c2', pinned: true })])).toMatchObject({ deleted: ['c1'], refused: [{ id: 'c2' }] });
  });
});

describe('undo and redo: one step per action', () => {
  it('restores exactly what an action touched', () => {
    let doc: ReadonlyMap<string, ParamElement> = new Map([['c1', col()], ['b1', beam()]]);
    let h = emptyHistory();
    ({ doc, history: h } = commit(doc, h, changeOf(doc, 'Move', move([col()], 500, 0))));
    ({ doc, history: h } = commit(doc, h, changeOf(doc, 'Copy', copy([beam()], 0, 3000, 0, () => 'b2'))));
    ({ doc, history: h } = commit(doc, h, changeOf(doc, 'Delete', remove([beam()]))));
    expect([...doc.keys()].sort()).toEqual(['b2', 'c1']);
    let u = undo(doc, h);
    expect(u.label).toBe('Delete');
    expect(u.doc.get('b1')).toEqual(beam());
    u = undo(u.doc, u.history);
    expect(u.doc.has('b2')).toBe(false);
    u = undo(u.doc, u.history);
    expect(u.doc.get('c1')).toEqual(col());
    const r = redo(u.doc, u.history);
    expect(r.doc.get('c1')!.center).toEqual([1500, 0]);
    expect(changeOf(doc, 'Nothing', move([], 1, 1))).toBeNull();
  });
});

it('makes IFC GlobalIds', () => {
  const id = newGlobalId((k) => new Uint8Array(k).fill(7));
  expect(id).toHaveLength(22);
  expect(id).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
});
