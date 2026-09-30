/** Shared models in a folder: development and tests (the same rules as production, no Vercel account). */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isShareId, type ShareMeta, type ShareStore } from './_share-core';

export function localStore(dir: string, urlFor: (id: string) => string): ShareStore & { writeData(id: string, bytes: Uint8Array): Promise<void>; readData(id: string): Promise<Uint8Array | null> } {
  const folder = (id: string) => join(dir, id);
  return {
    mode: 'local',
    async getMeta(id) {
      try {
        return JSON.parse(await readFile(join(folder(id), 'meta.json'), 'utf8')) as ShareMeta;
      } catch {
        return null;
      }
    },
    async putMeta(meta) {
      await mkdir(folder(meta.id), { recursive: true });
      await writeFile(join(folder(meta.id), 'meta.json'), JSON.stringify(meta));
    },
    async dataUrl(id) {
      try {
        await stat(join(folder(id), 'model.bin'));
        return urlFor(id);
      } catch {
        return null;
      }
    },
    async remove(id) {
      await rm(folder(id), { recursive: true, force: true });
    },
    async listIds() {
      try {
        return (await readdir(dir)).filter(isShareId);
      } catch {
        return [];
      }
    },
    async writeData(id, bytes) {
      await mkdir(folder(id), { recursive: true });
      await writeFile(join(folder(id), 'model.bin'), bytes);
    },
    async readData(id) {
      try {
        return new Uint8Array(await readFile(join(folder(id), 'model.bin')));
      } catch {
        return null;
      }
    },
  };
}
