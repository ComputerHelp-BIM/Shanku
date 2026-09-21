import { existsSync, readFileSync } from 'node:fs';
import * as WebIFC from 'web-ifc';
import { describe, expect, it } from 'vitest';
import { parseIfc } from '../src/ifc/parse';

// Performance check against a ~50k-element model. Skipped unless SHANKU_LARGE_IFC points at one:
//   python tools/fixtures/make_sample_ifc.py large large-frame.ifc
//   SHANKU_LARGE_IFC=../../large-frame.ifc npm test -w @shanku/engine
const file = process.env.SHANKU_LARGE_IFC;

describe.skipIf(!file || !existsSync(file))('large model', () => {
  it('parses 50k elements within the open budget', async () => {
    const api = new WebIFC.IfcAPI();
    await api.Init();
    api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF);
    const t0 = performance.now();
    const { model } = parseIfc(api, new Uint8Array(readFileSync(file!)), { fileName: 'large' });
    const ms = performance.now() - t0;
    const { info } = model;
    const mb = (model.mesh.positions.byteLength + model.mesh.normals.byteLength + model.mesh.elementIds.byteLength + model.mesh.indices.byteLength + model.edges.positions.byteLength + model.edges.elementIds.byteLength) / 1048576;
    console.log(
      `large: ${info.elementCount} elements, ${info.triangleCount} triangles, ${info.edgeCount} edges, ` +
        `GPU buffers ${mb.toFixed(1)} MB, parse ${Math.round(ms)} ms ` +
        `(open ${Math.round(info.timings.open)}, relations ${Math.round(info.timings.relations)}, geometry ${Math.round(info.timings.geometry)})`,
    );
    expect(info.elementCount).toBeGreaterThan(50_000);
    expect(ms).toBeLessThan(8_000);
  });
});
