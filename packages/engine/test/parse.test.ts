import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as WebIFC from 'web-ifc';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseIfc, readProperties } from '../src/ifc/parse';

const SAMPLE = fileURLToPath(new URL('../../../apps/web/public/samples/sample-frame.ifc', import.meta.url));

describe('parseIfc on the sample RCC frame', () => {
  const api = new WebIFC.IfcAPI();
  let result: ReturnType<typeof parseIfc>;

  beforeAll(async () => {
    await api.Init();
    api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF);
    result = parseIfc(api, new Uint8Array(readFileSync(SAMPLE)), { fileName: 'sample-frame.ifc' });
  });

  it('finds every element with its category', () => {
    const { info } = result.model;
    expect(info.schema).toBe('IFC4');
    expect(info.elementCount).toBe(72);
    expect(info.categories).toEqual({ Footing: 12, Column: 24, Beam: 34, Slab: 2 });
  });

  it('keeps identity: unique 22-char GlobalIds, express IDs, names, types, levels', () => {
    const els = result.model.elements;
    const ids = new Set(els.map((e) => e.globalId));
    expect(ids.size).toBe(els.length);
    for (const e of els) expect(e.globalId).toMatch(/^[0-9A-Za-z_$]{22}$/);
    const c1 = els.find((e) => e.name === 'C1')!;
    expect(c1.category).toBe('Column');
    expect(c1.ifcClass).toBe('IfcColumn');
    expect(c1.typeName).toBe('C-400x400');
    expect(c1.level).toBe('Level 1');
    expect(els.find((e) => e.name === 'F1')!.level).toBe('Foundation');
  });

  it('reads levels in elevation order with counts, and project units', () => {
    const { levels, units } = result.model.info;
    expect(levels.map((l) => l.name)).toEqual(['Foundation', 'Level 1', 'Level 2']);
    expect(levels.map((l) => l.elementCount)).toEqual([12, 30, 30]);
    expect(units.length).toBe('mm');
  });

  it('builds one consistent mesh with an element index per vertex', () => {
    const { mesh, info, elements } = result.model;
    expect(mesh.positions.length).toBe(info.vertexCount * 3);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.elementIds.length).toBe(info.vertexCount);
    expect(mesh.indices.length).toBe(info.triangleCount * 3);
    let maxIndex = 0;
    for (const i of mesh.indices) if (i > maxIndex) maxIndex = i;
    expect(maxIndex).toBeLessThan(info.vertexCount);
    const seen = new Set(mesh.elementIds);
    expect(seen.size).toBe(elements.length);
  });

  it('puts geometry where it belongs: a 400 x 400 column 3.05 m tall, Y up', () => {
    const c1 = result.model.elements.find((e) => e.name === 'C1')!;
    const [x0, y0, z0, x1, y1, z1] = c1.bounds;
    expect(x1 - x0).toBeCloseTo(0.4, 3);
    expect(z1 - z0).toBeCloseTo(0.4, 3);
    expect(y1 - y0).toBeCloseTo(3.05, 3);
  });

  it('extracts feature edges only: 12 per box-shaped element', () => {
    const { edges, info } = result.model;
    expect(edges.positions.length).toBe(info.edgeCount * 6);
    expect(info.edgeCount).toBe(72 * 12);
  });

  it('reads property sets and quantities on demand', async () => {
    const c1 = result.model.elements.find((e) => e.name === 'C1')!;
    const groups = await readProperties(api, result.modelID, c1.expressId, result.model.info.units);
    const names = groups.map((g) => g.name);
    expect(names).toContain('Attributes');
    expect(names).toContain('Pset_ColumnCommon');
    expect(names).toContain('Shanku_Structural');
    const structural = groups.find((g) => g.name === 'Shanku_Structural')!;
    expect(structural.items).toEqual(
      expect.arrayContaining([
        { name: 'Mark', value: 'C1', unit: '' },
        { name: 'ConcreteGrade', value: 'M40', unit: '' },
      ]),
    );
    const qto = groups.find((g) => g.kind === 'qto')!;
    expect(qto.items.find((i) => i.name === 'Length')?.unit).toBe('mm');
  });
});
