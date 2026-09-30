// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import Ajv2020 from 'ajv/dist/2020';
import { PROJECT_EXT, ProjectFileError, canonical, isProjectFile, packProject, projectNameFor, safeName, unpackProject } from '../src/lib/project';
import { projectLabel } from '../src/features/project/projectLabel';

const model = { name: 'adani.ifc', bytes: new TextEncoder().encode("ISO-10303-21;\nDATA;#1=IFCPROJECT('x');ENDSEC;\n".repeat(5000)) };
const state = {
  views: [
    { id: '3d', kind: '3d', name: '{3D}', graphics: { categories: {} }, displayStyle: 'shaded', edges: true },
    { id: 'plan:Level 2', kind: 'plan', name: 'Level 2', level: 'Level 2', graphics: {}, displayStyle: 'shaded', edges: true, dims: [{ id: 'd1', kind: 'aligned' }] },
    { id: 'plan/Level 2', kind: 'plan', name: 'Level 2 (copy)', level: 'Level 2', graphics: {}, displayStyle: 'shaded', edges: true },
  ],
  graphics: { categories: { Slab: { transparency: 70 } } },
  pending: { key: 'doc-1', changes: [{ globalId: 'g2', name: 'Mark', value: 'C2', kind: 'param' }, { globalId: 'g1', name: 'Comments', value: 'x', kind: 'param', oldDisplay: null }] },
  rates: { concrete: 7200 },
};
const files = (b: Uint8Array) => unzipSync(b);
const schema = (n: string) => JSON.parse(readFileSync(join(__dirname, '../../../docs/format/schemas', n), 'utf8'));

describe('.shkp, schema 2 (docs/format)', () => {
  it('round-trips the model and everything kept for it', () => {
    const p = unpackProject(packProject(model, state, '0.51.0'));
    expect(p.manifest).toMatchObject({ format: 'shanku-project', schema: 2, app: '0.51.0', name: 'adani', model: { path: 'model/adani.ifc', fileName: 'adani.ifc' } });
    expect(p.model.bytes).toEqual(model.bytes);
    expect(p.state.views).toEqual(state.views); // order kept
    expect(p.state.graphics).toEqual(state.graphics);
    expect(p.state.rates).toEqual(state.rates);
    expect(p.state.pending?.key).toBe('doc-1');
    expect(new Set(p.state.pending?.changes)).toEqual(new Set(state.pending.changes));
  });

  it('is deterministic: the same project saves to identical bytes', () => {
    const a = packProject(model, state, '0.51.0');
    const b = packProject(model, structuredClone(state), '0.51.0');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('is laid out for Git: sorted keys, a file per view, a line per change', () => {
    const f = files(packProject(model, state, '0.51.0'));
    expect(Object.keys(f)).toEqual(['model/adani.ifc', 'revit/link.json', 'revit/pending.jsonl', 'shanku.json', 'shanku/graphics.json', 'shanku/rates.json', 'shanku/views.json', 'shanku/views/3d.json', 'shanku/views/plan_Level_2-2.json', 'shanku/views/plan_Level_2.json']);
    expect(JSON.parse(strFromU8(f['shanku/views.json']))).toEqual([
      { id: '3d', file: '3d.json' },
      { id: 'plan:Level 2', file: 'plan_Level_2.json' },
      { id: 'plan/Level 2', file: 'plan_Level_2-2.json' },
    ]);
    const manifestText = strFromU8(f['shanku.json']);
    expect(manifestText).toBe(canonical(JSON.parse(manifestText))); // canonical: sorted keys, 2 spaces, final newline
    expect(manifestText.endsWith('}\n')).toBe(true);
    expect(manifestText).not.toMatch(/savedAt|20\d\d-/); // no save time in content
    const lines = strFromU8(f['revit/pending.jsonl']).trimEnd().split('\n');
    expect(lines).toEqual(['{"globalId":"g1","kind":"param","name":"Comments","oldDisplay":null,"value":"x"}', '{"globalId":"g2","kind":"param","name":"Mark","value":"C2"}']);
  });

  it('validates against the published schemas', () => {
    const ajv = new Ajv2020({ strict: false });
    const f = files(packProject(model, state, '0.51.0'));
    const compiled = new Map<string, ReturnType<typeof ajv.compile>>();
    const check = (schemaFile: string, data: unknown) => {
      if (!compiled.has(schemaFile)) compiled.set(schemaFile, ajv.compile(schema(schemaFile)));
      const validate = compiled.get(schemaFile)!;
      expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
    };
    check('shanku.schema.json', JSON.parse(strFromU8(f['shanku.json'])));
    check('link.schema.json', JSON.parse(strFromU8(f['revit/link.json'])));
    for (const [k, v] of Object.entries(f)) if (k.startsWith('shanku/views/')) check('view.schema.json', JSON.parse(strFromU8(v)));
    for (const l of strFromU8(f['revit/pending.jsonl']).trim().split('\n')) check('pending.schema.json', JSON.parse(l));
  });

  it('opens Shanku 0.50.0 .shk files (schema 1)', () => {
    const j = (v: unknown) => strToU8(JSON.stringify(v));
    const shk = zipSync({
      'manifest.json': j({ format: 'shanku-project', schema: 1, app: '0.50.0', name: 'adani.shk', savedAt: '2026-09-30T10:00:00Z', model: { path: 'model/adani.ifc', fileName: 'adani.ifc', bytes: 3 } }),
      'model/adani.ifc': strToU8('ifc'),
      'state/views.json': j(state.views),
      'state/graphics.json': j(null),
      'state/pending.json': j(state.pending),
      'state/rates.json': j(state.rates),
    });
    const p = unpackProject(shk);
    expect(p.manifest.schema).toBe(1);
    expect(p.state).toEqual({ views: state.views, graphics: undefined, pending: state.pending, rates: state.rates });
  });

  it('refuses what it cannot read, saying why', () => {
    expect(() => unpackProject(new Uint8Array([1, 2, 3]))).toThrow(ProjectFileError);
    expect(() => unpackProject(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/no Shanku manifest/);
    const newer = zipSync({ 'shanku.json': strToU8(JSON.stringify({ format: 'shanku-project', schema: 99, app: '9', name: 'a', model: { path: 'model/a.ifc', fileName: 'a.ifc' } })), 'model/a.ifc': strToU8('x') });
    expect(() => unpackProject(newer)).toThrow(/newer Shanku/);
  });

  it('names and recognises project files', () => {
    expect(PROJECT_EXT).toBe('.shkp');
    expect(projectNameFor('adani.ifc')).toBe('adani.shkp');
    expect(projectNameFor('tower.ifc.gz')).toBe('tower.shkp');
    expect(isProjectFile('Adani.SHKP')).toBe(true);
    expect(isProjectFile('old.shk')).toBe(true); // 0.50.0 files still open
    expect(isProjectFile('adani.ifc')).toBe(false);
    expect(safeName('plan:Level 2 / B*')).toBe('plan_Level_2_B_');
  });

  it('says where the work is in the title bar', () => {
    const now = Date.parse('2026-09-30T10:10:00Z');
    expect(projectLabel({ file: null, linked: false, savedAt: null, dirty: false }, now)).toBe('Kept on this device · not saved to a file');
    expect(projectLabel({ file: 'adani.shkp', linked: true, savedAt: now - 5 * 60_000, dirty: false }, now)).toBe('adani.shkp · saved 5 min ago');
    expect(projectLabel({ file: 'adani.shkp', linked: true, savedAt: now, dirty: true }, now)).toBe('adani.shkp · changes not saved to the file');
  });
});
