import { describe, expect, it } from 'vitest';
import { afterApply, byGroup, changeKey, commonParams, effectiveCommon, stageEdit, type RevitElementParams } from '../src/lib/paramEdits';

const el = (g: string, mark: string, offset = '0 mm', extra: RevitElementParams['params'] = []): RevitElementParams => ({
  globalId: g,
  elementId: 1,
  category: 'Structural Columns',
  typeName: 'C 300x600',
  params: [
    { id: -1, name: 'Mark', group: 'Identity Data', kind: 'text', display: mark, readOnly: false },
    { id: -2, name: 'Base Offset', group: 'Constraints', kind: 'number', display: offset, readOnly: false },
    { id: -3, name: 'Volume', group: 'Dimensions', kind: 'number', display: '0.54 m³', readOnly: true, why: 'Read-only in Revit' },
    ...extra,
  ],
});
const label = (e: RevitElementParams) => `Column ${e.params[0].display}`;

describe('parameter editing', () => {
  it('common parameters of a selection, with Varies', () => {
    const c = commonParams([el('a', 'C1'), el('b', 'C2', '0 mm', [{ id: -9, name: 'Only on b', group: 'Other', kind: 'text', display: 'x', readOnly: false }])]);
    expect(c.map((p) => p.name)).toEqual(['Mark', 'Base Offset', 'Volume']); // "Only on b" is not shared
    expect(c[0]).toMatchObject({ varies: true, display: null });
    expect(c[1]).toMatchObject({ varies: false, display: '0 mm' });
    expect(c[2]).toMatchObject({ readOnly: true, why: 'Read-only in Revit' });
  });

  it('staging edits all selected; typing the Revit value back removes the change; read-only is skipped', () => {
    const els = [el('a', 'C1'), el('b', 'C2')];
    let p = stageEdit([], els, { id: -1, name: 'Mark' }, 'C9', label);
    expect(p.map((c) => [c.globalId, c.oldDisplay, c.value])).toEqual([
      ['a', 'C1', 'C9'],
      ['b', 'C2', 'C9'],
    ]);
    p = stageEdit(p, [els[0]], { id: -1, name: 'Mark' }, 'C1', label); // back to Revit's value
    expect(p.map((c) => c.globalId)).toEqual(['b']);
    expect(stageEdit([], els, { id: -3, name: 'Volume' }, '1', label)).toEqual([]);
  });

  it('what Properties shows: the pending value, marked as modified', () => {
    const els = [el('a', 'C1'), el('b', 'C1')];
    const p = stageEdit([], [els[0]], { id: -1, name: 'Mark' }, 'C5', label);
    const mark = commonParams(els)[0];
    expect(effectiveCommon(p, els, mark)).toEqual({ display: null, varies: true, modified: true });
    expect(effectiveCommon(p, [els[0]], mark)).toEqual({ display: 'C5', varies: false, modified: true });
  });

  it('after apply: accepted changes leave, refused ones stay with their reason', () => {
    const els = [el('a', 'C1'), el('b', 'C2')];
    const p = stageEdit([], els, { id: -1, name: 'Mark' }, 'C9', label);
    const r = afterApply(p, p, [{ ok: true, newDisplay: 'C9' }, { ok: false, error: 'Borrowed by Priya in the central model.' }]);
    expect(r.applied).toBe(1);
    expect(r.remaining.map((c) => c.globalId)).toEqual(['b']);
    expect(r.failed.get(changeKey(p[1]))).toMatch(/Borrowed/);
  });

  it('groups in the order Revit sends them', () => {
    expect(byGroup(commonParams([el('a', 'C1')])).map((g) => g.group)).toEqual(['Identity Data', 'Constraints', 'Dimensions']);
  });

  it('drops a repeated name within a group (hidden schedule copies from add-ins before 0.3.0)', () => {
    const dup = el('a', 'C1', '0 mm', [{ id: -99, name: 'Base Offset', group: 'Constraints', kind: 'number', display: '0 mm', readOnly: true }]);
    expect(commonParams([dup]).filter((p) => p.name === 'Base Offset')).toHaveLength(1);
    expect(commonParams([dup]).find((p) => p.name === 'Base Offset')?.id).toBe(-2); // the first, editable one
  });
});
