import { describe, expect, it } from 'vitest';
import { changesGeometry, stageOp, stageTypeEdit, toEditOp, typeKey, type PendingChange } from '../src/lib/paramEdits';
import { geometryProblem, readNumber, typeNameProblem } from '../src/lib/editChecks';

const H = { id: -2002, name: 'h', display: '600.000' };

describe('staging edits for Revit', () => {
  it('a type parameter: one row per type and parameter, gone when set back', () => {
    const t = { typeId: 485401, familyName: 'Concrete-Rectangular-Column', typeName: 'CH-300 X 600' };
    let p: PendingChange[] = stageTypeEdit([], t, H, '650', 'Type CH-300 X 600');
    p = stageTypeEdit(p, t, H, '700', 'Type CH-300 X 600');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: 'typeParam', globalId: 'type:485401', value: '700', oldDisplay: '600.000' });
    expect(stageTypeEdit(p, t, H, '600.000', 'x')).toHaveLength(0);
    expect(typeKey({ familyName: 'F', typeName: 'CH 2' })).toBe('type:F/CH 2');
  });

  it('moves, rotations and type switches are rows of their own, converted for the add-in', () => {
    let p = stageOp([], { kind: 'move', globalIds: ['a', 'b'], dx: 500, dy: 0, dz: -150, name: 'Move', value: 'ΔX 500', element: '2 elements' });
    p = stageOp(p, { kind: 'move', globalIds: ['a'], dx: 100, dy: 0, dz: 0, name: 'Move', value: 'ΔX 100', element: 'C-1' });
    expect(new Set(p.map((c) => c.globalId)).size).toBe(2); // unique keys
    expect(toEditOp(p[0])).toEqual({ kind: 'move', globalIds: ['a', 'b'], dx: 500, dy: 0, dz: -150, typeId: undefined, familyName: undefined, typeName: undefined, newName: undefined, angle: undefined, about: undefined });
    const param: PendingChange = { globalId: 'g1', paramId: 5, name: 'Comments', oldDisplay: 'x', value: 'y', element: 'C-1' };
    expect(toEditOp(param)).toEqual({ kind: 'param', globalIds: ['g1'], paramId: 5, name: 'Comments', oldDisplay: 'x', value: 'y' });
    // a duplicated type does not exist in Revit yet: its edits carry no "was" value to check
    const dup = stageTypeEdit([], { familyName: 'F', typeName: 'CH-300 X 650' }, H, '650', 'Type F: CH-300 X 650');
    expect(toEditOp(dup[0])).toMatchObject({ kind: 'typeParam', familyName: 'F', typeName: 'CH-300 X 650', oldDisplay: null });
    expect([p[0], param, dup[0]].map(changesGeometry)).toEqual([true, false, true]);
  });

  it('a move or rotation is checked before it is staged, as the add-in checks it', () => {
    expect(readNumber('−1,500')).toBe(-1500);
    expect(readNumber('1 500.5')).toBe(1500.5);
    expect(readNumber('')).toBe(0);
    expect(readNumber('5m')).toBeNaN();
    expect(geometryProblem({ kind: 'move', dx: 500, dy: 0, dz: 0 })).toBeNull();
    expect(geometryProblem({ kind: 'move', dx: 0, dy: 0, dz: 0 })).toBe('Type a distance to move by.');
    expect(geometryProblem({ kind: 'move', dx: 2e6, dy: 0, dz: 0 })).toMatch(/1 km/);
    expect(geometryProblem({ kind: 'move', dx: NaN, dy: 0, dz: 0 })).toMatch(/not a number/);
    expect(geometryProblem({ kind: 'rotate', angle: 90, about: 'each' })).toBeNull();
    expect(geometryProblem({ kind: 'rotate', angle: 400, about: 'group' })).toMatch(/full turn/);
  });

  it('a new type name follows Revit’s rules and must be free', () => {
    expect(typeNameProblem('CH-300 X 650', ['CH-300 X 600'])).toBeNull();
    expect(typeNameProblem('CH-300 X 600', ['CH-300 X 600'])).toMatch(/already has/);
    expect(typeNameProblem('CH:300', [])).toBe('Revit does not allow ":" in a type name.');
    expect(typeNameProblem(' CH', [])).toMatch(/space/);
    expect(typeNameProblem('', [])).toMatch(/needs a name/);
  });
});
