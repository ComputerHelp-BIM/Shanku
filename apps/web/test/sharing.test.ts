// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ShareError, checkTeam, checkUploadPath, cleanFileName, cleanup, open, register, remove, sha256hex } from '../../../api/_share-core';
import { localStore } from '../../../api/_share-local';
import { modelParam, readModelParam, seal, unseal } from '../src/lib/sharedModel';

const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const ID2 = 'BBBBBBBBBBBBBBBBBBBBBB';
let dir = '';
afterEach(async () => dir && rm(dir, { recursive: true, force: true }));
async function store() {
  dir = await mkdtemp(join(tmpdir(), 'shares-'));
  return localStore(dir, (id) => `/data/${id}`);
}
const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return e instanceof ShareError ? e.status : 500;
  }
};

describe('shared models: the server’s rules', () => {
  it('an upload permission is only for a new share’s model file; the team code when one is set', async () => {
    const s = await store();
    expect(await checkUploadPath(s, `shares/${ID}/model.bin`)).toBe(ID);
    expect(await status(checkUploadPath(s, 'shares/../../etc/passwd'))).toBe(400);
    expect(await status(checkUploadPath(s, `shares/${ID}/other.bin`))).toBe(400);
    expect(() => checkTeam(undefined, null)).not.toThrow();
    expect(() => checkTeam('tower-7', 'tower-7')).not.toThrow();
    expect(() => checkTeam('tower-7', null)).toThrow(/team code/);
  });

  it('kept as chosen, refused and removed once expired, deleted only with the secret', async () => {
    const s = await store();
    const secret = 'the-secret';
    const body = { id: ID, file: 'C:\\models\\adani.ifc', size: 1234, retention: '1h', deleteHash: sha256hex(secret) };
    expect(await status(register(s, body))).toBe(400); // not uploaded yet
    await s.writeData(ID, new Uint8Array([1, 2, 3]));
    const t0 = 1_000_000;
    const r = await register(s, body, t0);
    expect(r.expiresAt).toBe(t0 + 3_600_000);
    expect(await status(register(s, body, t0))).toBe(409); // no overwriting
    expect(await status(checkUploadPath(s, `shares/${ID}/model.bin`))).toBe(409);
    const o = await open(s, ID, t0 + 60_000);
    expect(o).toMatchObject({ file: 'adani.ifc', size: 1234, url: `/data/${ID}` });
    expect(await status(remove(s, ID, 'wrong'))).toBe(403);
    expect(await status(open(s, ID, t0 + 3_600_001))).toBe(410); // expired: refused…
    expect(await s.getMeta(ID)).toBeNull(); // …and removed
    expect(await status(open(s, ID, t0))).toBe(404);
    // until deleted: only the secret removes it
    await s.writeData(ID2, new Uint8Array([1]));
    await register(s, { ...body, id: ID2, retention: 'keep' }, t0);
    expect((await open(s, ID2, t0 + 10 * 365 * 86_400_000)).url).toBe(`/data/${ID2}`);
    await remove(s, ID2, secret);
    expect(await s.getMeta(ID2)).toBeNull();
  });

  it('the daily cleanup removes only what has expired', async () => {
    const s = await store();
    for (const [id, retention] of [
      [ID, '1h'],
      [ID2, '3d'],
    ] as const) {
      await s.writeData(id, new Uint8Array([1]));
      await register(s, { id, file: 'm.ifc', size: 1, retention, deleteHash: sha256hex('x') }, 0);
    }
    expect(await cleanup(s, 2 * 3_600_000)).toEqual({ removed: 1, kept: 1 });
    expect(await s.getMeta(ID)).toBeNull();
    expect(await s.getMeta(ID2)).not.toBeNull();
  });

  it('file names are cleaned', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('C:\\a\\b<c>.ifc')).toBe('bc.ifc');
    expect(cleanFileName('')).toBe('model.ifc');
  });
});

describe('shared models: encrypted on this device', () => {
  it('round-trips exactly; the wrong key or altered data fails; the upload hides the content', async () => {
    const model = new TextEncoder().encode("ISO-10303-21;\nHEADER;FILE_NAME('adani.ifc');ENDSEC;\n".repeat(200));
    const { data, key } = await seal(model);
    expect(Buffer.from(data).includes(Buffer.from('ISO-10303-21'))).toBe(false);
    expect(data.byteLength).toBeLessThan(model.byteLength); // compressed before encrypting
    expect(await unseal(data, key)).toEqual(model);
    const other = (await seal(new Uint8Array([1]))).key;
    await expect(unseal(data, other)).rejects.toThrow();
    const tampered = data.slice();
    tampered[40] ^= 1;
    await expect(unseal(tampered, key)).rejects.toThrow();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('the model part of a link', () => {
    const k = 'k'.repeat(43);
    expect(readModelParam(`#app&view=abc${modelParam(ID, k)}`)).toEqual({ id: ID, key: k });
    expect(readModelParam('#app&view=abc')).toBeNull();
  });
});
