// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { PROJECT_EXT, ProjectFileError, isProjectFile, packProject, projectNameFor, unpackProject } from '../src/lib/project';
import { projectLabel } from '../src/features/project/projectLabel';

const model = { name: 'adani.ifc', bytes: new TextEncoder().encode("ISO-10303-21;\nDATA;#1=IFCPROJECT('x');ENDSEC;\n".repeat(5000)) }; // ~230 kB, a small real model's size
const state = {
  views: [{ id: 'plan:Level 2', name: 'Level 2 (copy)', dims: [{ id: 'd1' }] }],
  graphics: { categories: { Slab: { transparency: 70 } } },
  pending: { key: 'doc-1', changes: [{ globalId: 'g1', name: 'Comments', value: 'x' }] },
  rates: { concrete: 7200 },
};

describe('the Shanku project file', () => {
  it('round-trips the model and everything kept for it', () => {
    const bytes = packProject(model, state, '0.50.0', new Date('2026-09-30T10:00:00Z'));
    const p = unpackProject(bytes);
    expect(p.manifest).toMatchObject({ format: 'shanku-project', schema: 1, app: '0.50.0', name: 'adani.shk', savedAt: '2026-09-30T10:00:00.000Z' });
    expect(p.model.name).toBe('adani.ifc');
    expect(p.model.bytes).toEqual(model.bytes);
    expect(p.state).toEqual(state);
    expect(bytes.byteLength).toBeLessThan(model.bytes.byteLength / 5); // compressed
  });

  it('refuses what it cannot read, saying why', () => {
    expect(() => unpackProject(new Uint8Array([1, 2, 3]))).toThrow(ProjectFileError);
    expect(() => unpackProject(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/no Shanku manifest/);
    const newer = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'shanku-project', schema: 99, model: { path: 'model/a.ifc', fileName: 'a.ifc', bytes: 1 } })), 'model/a.ifc': strToU8('x') });
    expect(() => unpackProject(newer)).toThrow(/newer Shanku/);
    const empty = packProject(model, {}, '0.50.0');
    expect(unpackProject(empty).state).toEqual({ views: undefined, graphics: undefined, pending: undefined, rates: undefined });
  });

  it('names and recognises project files', () => {
    expect(PROJECT_EXT).toBe('.shk');
    expect(projectNameFor('adani.ifc')).toBe('adani.shk');
    expect(projectNameFor('tower.ifc.gz')).toBe('tower.shk');
    expect(isProjectFile('Adani.SHK')).toBe(true);
    expect(isProjectFile('adani.ifc')).toBe(false);
  });

  it('says where the work is in the title bar', () => {
    const now = Date.parse('2026-09-30T10:10:00Z');
    expect(projectLabel({ file: null, linked: false, savedAt: null, dirty: false }, now)).toBe('Kept on this device · not saved to a file');
    expect(projectLabel({ file: 'adani.shk', linked: true, savedAt: now - 5 * 60_000, dirty: false }, now)).toBe('adani.shk · saved 5 min ago');
    expect(projectLabel({ file: 'adani.shk', linked: false, savedAt: now - 10_000, dirty: false }, now)).toBe('adani.shk · downloaded just now');
    expect(projectLabel({ file: 'adani.shk', linked: true, savedAt: now, dirty: true }, now)).toBe('adani.shk · changes not saved to the file');
  });
});
