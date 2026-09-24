import { describe, expect, it } from 'vitest';
import type { Category, ElementRecord } from '../src/model/types';
import { DEFAULT_CHECKS, findingId, runChecks } from '../src/qa/checks';

let next = 0;
/** An element from a box in metres: x0, y0 (bottom), z0, then width (x), height (y), depth (z). */
function el(category: Category, box: [number, number, number, number, number, number], extra: Partial<ElementRecord> = {}): ElementRecord {
  const [x, y, z, w, h, d] = box;
  const i = next++;
  const isVertical = category === 'Column';
  return {
    index: i,
    expressId: 100 + i,
    globalId: `G${i}`,
    ifcClass: `Ifc${category}`,
    category,
    name: '',
    tag: '',
    typeName: '',
    level: 'Level 1',
    mark: `${category[0]}${i}`,
    markSource: 'test',
    grade: 'M30',
    gradeSource: 'test',
    volume: w * h * d,
    area: null,
    length: isVertical ? h : category === 'Beam' || category === 'Member' ? Math.max(w, d) : null,
    quantitySource: 'geometry',
    dims: isVertical ? { length: null, width: w, depth: d, height: h } : { length: Math.max(w, d), width: Math.min(w, d), depth: h, height: null },
    bounds: [x, y, z, x + w, y + h, z + d],
    ...extra,
  };
}
/** Re-index a list so element i sits at position i, as in a real model. */
function model(...els: ElementRecord[]) {
  const elements = els.map((e, i) => ({ ...e, index: i, globalId: e.globalId }));
  return { elements, levels: [] };
}
const ids = (r: ReturnType<typeof runChecks>) => r.findings.map((f) => f.checkId);
const only = (id: string) => DEFAULT_CHECKS.filter((c) => c.id === id);

describe('model health checks', () => {
  it('finds duplicates within 5 mm, not 10 mm apart', () => {
    const m = model(el('Beam', [0, 3, 0, 5, 0.45, 0.23]), el('Beam', [0.004, 3, 0, 5, 0.45, 0.23]), el('Beam', [0.02, 3, 0, 5, 0.45, 0.23]));
    const r = runChecks(m, only('duplicates'));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].elements).toEqual([0, 1]);
    expect(r.findings[0].severity).toBe('error');
    expect(r.findings[0].detail).toContain('2 beams');
  });

  it('finds overlapping columns but leaves exact duplicates to the duplicate check', () => {
    const a = el('Column', [0, 0, 0, 0.3, 3, 0.3]);
    const b = el('Column', [0.2, 0, 0, 0.3, 3, 0.3]); // overlaps a by 100 mm
    const c = el('Column', [5, 0, 0, 0.3, 3, 0.3]);
    const d = el('Column', [5, 0, 0, 0.3, 3, 0.3]); // duplicate of c
    const r = runChecks(model(a, b, c, d), only('overlapping-columns'));
    expect(r.findings.map((f) => f.elements)).toEqual([[0, 1]]);
  });

  it('flags a floating column and passes one on a beam, a column or the base', () => {
    const base = el('Column', [0, 0, 0, 0.3, 3, 0.3]);
    const onColumn = el('Column', [0, 3, 0, 0.3, 3, 0.3]);
    const beam = el('Beam', [4, 2.55, 0, 6, 0.45, 0.3]); // top at 3.0
    const onBeam = el('Column', [6, 3.02, 0, 0.3, 3, 0.3]); // 20 mm gap: within 50 mm
    const floating = el('Column', [12, 3.5, 0, 0.3, 3, 0.3], { mark: 'C12', level: 'Level 2' });
    const slab = el('Slab', [11, 3.35, -1, 3, 0.15, 3]); // top at the column bottom: a slab alone is not a support
    const r = runChecks(model(base, onColumn, beam, onBeam, floating, slab), only('discontinuous-columns'));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].elements).toEqual([4]);
    expect(r.findings[0].detail).toBe('Column C12 on Level 2 stands on a slab with no column, wall or beam under it. A floating column needs a transfer beam or a column below.');
    expect(r.findings[0].clause).toMatch(/IS 1893/);
  });

  it('looks through a slab to the column below, as when columns stop under the slab', () => {
    const below = el('Column', [0, 0, 0, 0.3, 2.85, 0.3]);
    const slab = el('Slab', [-1, 2.85, -1, 3, 0.15, 3]);
    const above = el('Column', [0, 3, 0, 0.3, 3, 0.3]);
    const onSlabOnly = el('Column', [1.5, 3, 1.5, 0.3, 3, 0.3]); // nothing under the slab here
    const r = runChecks(model(below, slab, above, onSlabOnly), only('discontinuous-columns'));
    expect(r.findings.map((f) => f.elements)).toEqual([[3]]);
  });

  it('reports the gap to the nearest element below', () => {
    const r = runChecks(model(el('Column', [0, 0, 0, 0.3, 3, 0.3]), el('Column', [0, 3.45, 0, 0.3, 3, 0.3], { mark: 'C2' }), el('Column', [5, 3, 0, 0.3, 3, 0.3], { mark: 'C3' })), only('discontinuous-columns'));
    expect(r.findings[0].detail).toContain('starts 450 mm above');
    expect(r.findings[1].detail).toContain('C3 on Level 1 has nothing below it');
  });

  it('groups tiny, long and short elements by category', () => {
    const m = model(
      el('Beam', [0, 3, 0, 30, 0.45, 0.23]), // 30 m
      el('Beam', [0, 3, 5, 0.1, 0.45, 0.1]), // 100 mm long; 100 mm is not tiny
      el('Column', [0, 0, 0, 0.005, 3, 0.3]), // 5 mm wide
      el('Rebar', [0, 0, 0, 0.008, 3, 0.008]), // rebar is skipped
    );
    const r = runChecks(m, DEFAULT_CHECKS.filter((c) => c.id === 'tiny-elements' || c.id === 'unusual-length'));
    expect(r.findings.map((f) => f.title)).toEqual(['Column with no size', 'Very long beam', 'Very short beam']);
  });

  it('finds missing levels and grades', () => {
    const r = runChecks(model(el('Beam', [0, 3, 0, 5, 0.45, 0.23], { level: '' }), el('Slab', [0, 3, 0, 5, 0.15, 5], { grade: '' }), el('Other', [0, 0, 0, 1, 1, 1], { level: '', grade: '' })), DEFAULT_CHECKS.filter((c) => c.id === 'no-level' || c.id === 'no-grade'));
    expect(r.findings.map((f) => f.title)).toEqual(['Beam without a level', 'Slab without a grade']);
  });

  it('notes storeys without walls when the model has walls elsewhere', () => {
    const m = model(
      el('Column', [0, 0, 0, 0.3, 3, 0.3], { level: 'Ground' }),
      el('Wall', [1, 0, 0, 3, 3, 0.2], { level: 'Ground' }),
      el('Column', [0, 3, 0, 0.3, 3, 0.3], { level: 'Level 1' }),
      el('Wall', [1, 3, 0, 3, 3, 0.2], { level: 'Level 1' }),
      el('Column', [0, 6, 0, 0.3, 3, 0.3], { level: 'Level 2' }),
    );
    const r = runChecks(m, only('lateral-gap'));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].severity).toBe('info');
    expect(r.findings[0].detail).toContain('Level 2 has none');
    expect(r.findings[0].elements).toEqual([4]);
  });
});

describe('mark checks', () => {
  it('says so once when there are no marks at all', () => {
    const r = runChecks(model(el('Beam', [0, 3, 0, 5, 0.45, 0.23], { mark: '' })), only('missing-mark'));
    expect(r.findings.map((f) => [f.title, f.elements.length])).toEqual([['No marks found', 0]]);
  });

  it('lists unmarked elements when others are marked', () => {
    const r = runChecks(model(el('Beam', [0, 3, 0, 5, 0.45, 0.23]), el('Beam', [0, 3, 2, 5, 0.45, 0.23], { mark: '' })), only('missing-mark'));
    expect(r.findings[0].title).toBe('Beam without a mark');
    expect(r.findings[0].detail).toMatch(/^1 beam has no mark/);
  });

  it('warns about one mark with two sizes on a level, and notes size changes between storeys', () => {
    const m = model(
      el('Column', [0, 0, 0, 0.3, 3, 0.45], { mark: 'C1', level: 'L1' }),
      el('Column', [5, 0, 0, 0.45, 3, 0.3], { mark: 'C1', level: 'L1' }), // same section, rotated
      el('Column', [9, 0, 0, 0.3, 3, 0.6], { mark: 'C1', level: 'L1' }),
      el('Column', [0, 0, 0, 0.3, 3, 0.45], { mark: 'C2', level: 'L1' }),
      el('Column', [0, 3, 0, 0.23, 3, 0.45], { mark: 'C2', level: 'L2' }),
    );
    const r = runChecks(m, only('mark-conflict'));
    expect(r.findings.map((f) => [f.checkId, f.severity])).toEqual([
      ['mark-conflict', 'warning'],
      ['mark-by-storey', 'info'],
    ]);
    expect(r.findings[0].detail).toContain('300 × 450 M30 (2), 300 × 600 M30 (1)');
  });
});

describe('the sample model', () => {
  it('passes the model-health checks (it is built the way a real frame is)', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const WebIFC = await import('web-ifc');
    const { parseIfc } = await import('../src/ifc/parse');
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const bytes = new Uint8Array(readFileSync(fileURLToPath(new URL('../../../apps/web/public/samples/sample-frame.ifc', import.meta.url))));
    const { model } = parseIfc(api, bytes, { fileName: 'sample-frame.ifc' });
    const r = runChecks({ elements: model.elements, levels: model.info.levels });
    expect(r.findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });
});

describe('running checks', () => {
  it('sorts errors first and keeps finding ids stable', () => {
    const a = el('Beam', [0, 3, 0, 5, 0.45, 0.23], { level: '' });
    const b = el('Beam', [0, 3, 0, 5, 0.45, 0.23], { level: '' });
    const r1 = runChecks(model(a, b));
    const r2 = runChecks(model(b, a));
    expect(r1.findings[0].severity).toBe('error');
    expect(ids(r1)).toContain('no-level');
    expect(r1.findings.map((f) => f.id).sort()).toEqual(r2.findings.map((f) => f.id).sort());
    expect(findingId('x', [a, b])).toBe(findingId('x', [b, a]));
    expect(r1.checks).toHaveLength(DEFAULT_CHECKS.length);
  });

  it('checks 50,000 elements quickly', () => {
    const els: ElementRecord[] = [];
    for (let i = 0; i < 50000; i++) els.push(el(i % 5 === 0 ? 'Column' : 'Beam', [(i % 250) * 4, Math.floor(i / 2500) * 3, Math.floor(i / 250) % 10 * 4, 0.3, i % 5 === 0 ? 3 : 0.45, 0.3]));
    const r = runChecks(model(...els));
    expect(r.ms).toBeLessThan(3000);
  });
});
