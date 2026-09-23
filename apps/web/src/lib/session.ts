/**
 * Session persistence in IndexedDB (models can be tens of MB, far beyond localStorage): the open IFC
 * model, the open DXF drawings, and each file's Visibility/Graphics. Restored on reload; removed when
 * the file is closed. Everything stays on this device.
 */
export interface SavedFile {
  name: string;
  bytes: ArrayBuffer;
}

const DB = 'shanku';
const STORE = 'session';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch {
    return undefined; // private mode, quota full, or no IndexedDB: the app works without persistence
  }
}

export const saveModel = (f: SavedFile) => tx('readwrite', (s) => s.put({ name: f.name, bytes: f.bytes }, 'model'));
export const clearModel = () => tx('readwrite', (s) => s.delete('model'));
export const loadModel = () => tx<SavedFile>('readonly', (s) => s.get('model'));

export const saveDrawings = (files: SavedFile[]) => tx('readwrite', (s) => s.put(files, 'drawings'));
export const loadDrawings = async () => (await tx<SavedFile[]>('readonly', (s) => s.get('drawings'))) ?? [];

export const saveGraphics = (fileName: string, g: unknown) => tx('readwrite', (s) => s.put(g, `graphics:${fileName}`));
export const loadGraphics = <T>(fileName: string) => tx<T>('readonly', (s) => s.get(`graphics:${fileName}`));
