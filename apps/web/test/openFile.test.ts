import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { isGzip, kindOf, unpack } from '../src/lib/openFile';
import { SAMPLES } from '../src/lib/samples';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('opening .ifc.gz (the sample buildings)', () => {
  it('reads the kind through the .gz', () => {
    expect(kindOf('tower.ifc.gz')).toBe('ifc');
    expect(kindOf('plan.DXF')).toBe('dxf');
    expect(kindOf('notes.txt.gz')).toBeNull();
  });

  it('unpacks gzip by its magic number and drops .gz from the name; other files pass through', async () => {
    const text = 'ISO-10303-21;\nHEADER;\n';
    const gz = gzipSync(Buffer.from(text));
    const bytes = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength);
    expect(isGzip(bytes)).toBe(true);
    const out = await unpack({ name: 'g14-tower.ifc.gz', bytes });
    expect(out.name).toBe('g14-tower.ifc');
    expect(new TextDecoder().decode(out.bytes)).toBe(text);
    const plain = new TextEncoder().encode(text).buffer;
    const same = await unpack({ name: 'a.ifc', bytes: plain });
    expect(same.bytes).toBe(plain);
  });

  it('every sample on the start page is in public/samples', () => {
    for (const s of SAMPLES) expect(existsSync(join(__dirname, '..', 'public', 'samples', s.file)), s.file).toBe(true);
  });
});
