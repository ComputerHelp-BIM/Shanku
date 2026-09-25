import { describe, expect, it } from 'vitest';
import type { Category, ElementRecord } from '@shanku/engine';
import { describeScope, scopeElements } from '../src/lib/boqScope';
import { bandStatus, bandWarning, rebarEstimate } from '../src/lib/rebar';
import { diagnoseFile, ifcHeader } from '../src/lib/fileDiagnosis';
import { MAX_LINK_IDS, VIEW_TOKEN_PREFIX, decodeViewToken, encodeViewToken, hiddenForLink, viewLinkUrl, type ViewToken } from '../src/lib/viewLink';

const el = (index: number, category: Category, level: string, volume: number): ElementRecord =>
  ({ index, category, level, volume, globalId: `G${index}` }) as unknown as ElementRecord;
const els = [el(0, 'Column', 'Level 1', 2), el(1, 'Beam', 'Level 1', 3), el(2, 'Column', 'Level 2', 1), el(3, 'Slab', 'Level 3', 10), el(4, 'Other', '', 0)];
const ctx = { hidden: new Set([1, 3]), selection: new Set([0, 2]), levels: ['Level 1', 'Level 2', 'Level 3'] };
const idx = (list: ElementRecord[]) => list.map((e) => e.index);
const enc = (s: string) => new TextEncoder().encode(s);

describe('BOQ scope', () => {
  it('includes the whole model, visible elements, the selection or a level range', () => {
    expect(idx(scopeElements(els, { kind: 'model' }, ctx))).toEqual([0, 1, 2, 3, 4]);
    expect(idx(scopeElements(els, { kind: 'visible' }, ctx))).toEqual([0, 2, 4]);
    expect(idx(scopeElements(els, { kind: 'selection' }, ctx))).toEqual([0, 2]);
    expect(idx(scopeElements(els, { kind: 'levels', from: 'Level 2', to: 'Level 1' }, ctx))).toEqual([0, 1, 2]);
    expect(idx(scopeElements(els, { kind: 'levels', from: 'Gone', to: 'Level 1' }, ctx))).toEqual([]);
  });

  it('says what the numbers include', () => {
    expect(describeScope({ kind: 'model' }, 5, 5)).toBe('Whole model · 5 elements');
    expect(describeScope({ kind: 'visible' }, 312, 850)).toMatch(/^Visible elements only · 312 of 850 elements/);
    expect(describeScope({ kind: 'selection' }, 2, 1200)).toBe('Selection only · 2 of 1,200 elements');
    expect(describeScope({ kind: 'levels', from: 'Level 2', to: 'Level 2' }, 1, 5)).toBe('Level 2 only · 1 of 5 elements');
    expect(describeScope({ kind: 'levels', from: 'Level 1', to: 'Level 3' }, 4, 5)).toBe('Level 1 to Level 3 · 4 of 5 elements');
  });
});

describe('reinforcement estimate', () => {
  it('flags ratios outside the usual band', () => {
    expect(bandStatus('Column', 180)).toBe('ok');
    expect(bandStatus('Column', 1500)).toBe('high');
    expect(bandStatus('Slab', 40)).toBe('low');
    expect(bandStatus('Footing', 80)).toBe('none'); // no band: never flagged
    expect(bandWarning('Column', 1500)).toBe('1,500 kg/m³ is above the usual 120–250 kg/m³ for columns. Check the entry.');
    expect(bandWarning('Beam', 150)).toBeNull();
  });

  it('estimates steel per category and prices it', () => {
    const r = rebarEstimate(els, { ratios: { Column: 200, Beam: 150 }, rate: 70 });
    expect(r.rows.map((x) => [x.category, x.volume, x.kg])).toEqual([
      ['Column', 3, 600],
      ['Beam', 3, 450],
      ['Slab', 10, null],
    ]);
    expect(r.kg).toBe(1050);
    expect(r.amount).toBe(1050 * 70);
    expect(r.missing).toBe(1);
    expect(rebarEstimate(els, { ratios: { Column: 200 }, rate: null }).amount).toBe(0);
  });
});

describe('file diagnosis', () => {
  const IFC = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');\nFILE_NAME('a.ifc','2026-01-01T00:00:00',('Me'),('Firm'),'IfcOpenShell 0.8','Autodesk Revit 2025 (ENU)','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\n";

  it('reads the IFC header', () => {
    expect(ifcHeader(IFC)).toEqual({ schema: 'IFC4', view: 'ReferenceView_V1.2', writer: 'Autodesk Revit 2025 (ENU)' });
  });

  it('spots a cut-off IFC and reports its header', () => {
    const d = diagnoseFile({ name: 'a.ifc', size: 5000, head: enc(IFC), tail: enc('#99=IFCWALL(') , error: 'Unexpected end' });
    expect(d.title).toBe('The IFC file is incomplete');
    expect(d.report).toContain('IFC schema: IFC4');
    expect(d.report).toContain('Written by: Autodesk Revit 2025 (ENU)');
    expect(d.report).toContain('Ends with END-ISO-10303-21: no');
    expect(d.report).toContain('Error: Unexpected end');
  });

  it('recognises files by their bytes, not only the extension', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(diagnoseFile({ name: 'Tower.rvt', size: 9e7, head: ole }).title).toBe('Export IFC from Revit');
    expect(diagnoseFile({ name: 'plan.dxf', size: 9, head: enc('AC1032\0\0') }).format).toBe('AutoCAD DWG'); // a renamed DWG
    expect(diagnoseFile({ name: 'x.ifc', size: 9, head: enc('%PDF-1.7') }).format).toBe('PDF document');
    expect(diagnoseFile({ name: 'm.ifczip', size: 9, head: new Uint8Array([0x50, 0x4b, 3, 4]) }).title).toBe('Unzip it first');
    expect(diagnoseFile({ name: 'b.e2k', size: 9, head: enc('$ PROGRAM') }).format).toBe('ETABS model');
    expect(diagnoseFile({ name: 'e.ifc', size: 0, head: new Uint8Array() }).title).toBe('The file is empty');
    expect(diagnoseFile({ name: 'old.dxf', size: 9, head: enc('  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n') }).report).toContain('DXF version: AC1015');
    expect(diagnoseFile({ name: 'x.foo', size: 9, head: enc('hello') }, ['Shanku: 1.0']).report).toMatch(/Detected: Unknown \(\.foo\)[\s\S]*Shanku: 1\.0$/);
  });
});

describe('view links', () => {
  const t: ViewToken = { v: 1, file: 'Tower – rev B.ifc', view: 'plan:Level 1', camera: [1, 2, 3, 0, 0, 0, 1, 20, 0, 0, 0, 1], box: [0, 1, 0, 5, 2, 5, 0.3], style: 'hiddenLine', select: ['2O2Fr$t4X7Zf8NOew3FLOH'], hide: { mode: 'isolate', ids: ['a', 'b'] }, explode: { modes: ['storeys'], amount: 0.6 } };

  it('round-trips as text and as a link, with non-ASCII names', () => {
    const text = encodeViewToken(t);
    expect(text.startsWith(VIEW_TOKEN_PREFIX)).toBe(true);
    expect(decodeViewToken(text)).toEqual(t);
    const url = viewLinkUrl('https://shanku.app/app/#old', t);
    expect(url.startsWith('https://shanku.app/app/#app&view=')).toBe(true); // #app skips the homepage
    expect(decodeViewToken(url)).toEqual(t);
    expect(decodeViewToken(`  ${url}  `)).toEqual(t);
  });

  it('keeps links short: the smaller of hidden and shown, capped, isolation never cut', () => {
    expect(hiddenForLink(['a', 'b', 'c'], ['d'])).toEqual({ mode: 'isolate', ids: ['d'] });
    expect(hiddenForLink(['a'], ['b', 'c'])).toEqual({ mode: 'hide', ids: ['a'] });
    expect(hiddenForLink([], ['a'])).toBeUndefined();
    const many = Array.from({ length: MAX_LINK_IDS + 10 }, (_, i) => `id${i}`);
    const cut = decodeViewToken(encodeViewToken({ v: 1, file: 'f', select: many, hide: { mode: 'isolate', ids: many } }))!;
    expect(cut.select).toHaveLength(MAX_LINK_IDS);
    expect(cut.hide).toBeUndefined();
    expect(cut.partial).toBe(true);
  });

  it('rejects junk and drops malformed fields', () => {
    expect(decodeViewToken('hello')).toBeNull();
    expect(decodeViewToken('SHANKU/1|!!!')).toBeNull();
    expect(decodeViewToken(`${VIEW_TOKEN_PREFIX}${btoa('{"v":2,"file":"x"}')}`)).toBeNull();
    const bad = `${VIEW_TOKEN_PREFIX}${btoa(JSON.stringify({ v: 1, file: 'x', camera: [1, 2], select: [1, 2], explode: { modes: ['radial'], amount: 9 } })).replace(/=+$/, '')}`;
    expect(decodeViewToken(bad)).toEqual({ v: 1, file: 'x', explode: { modes: ['radial'], amount: 1 } });
  });
});
