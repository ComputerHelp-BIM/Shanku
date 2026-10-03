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

/** Recent files for the File menu (lib/recent): their handles are kept as they are (IndexedDB stores them). */
export const saveRecentList = (list: unknown[]) => tx('readwrite', (s) => s.put(list, 'recent'));
export const loadRecentList = <T>() => tx<T[]>('readonly', (s) => s.get('recent'));

export const saveDrawings = (files: SavedFile[]) => tx('readwrite', (s) => s.put(files, 'drawings'));
export const loadDrawings = async () => (await tx<SavedFile[]>('readonly', (s) => s.get('drawings'))) ?? [];

export const saveGraphics = (fileName: string, g: unknown) => tx('readwrite', (s) => s.put(g, `graphics:${fileName}`));
export const loadGraphics = <T>(fileName: string) => tx<T>('readonly', (s) => s.get(`graphics:${fileName}`));

export const saveViews = (fileName: string, views: unknown) => tx('readwrite', (s) => s.put(views, `views:${fileName}`));
export const loadViews = <T>(fileName: string) => tx<T>('readonly', (s) => s.get(`views:${fileName}`));

/** Pending changes for Revit (not yet applied) and the Revit document they are for, as the Revit feature keeps them. */
export interface SavedPending<T = unknown> {
  key: string;
  changes: T[];
}

/** Everything kept for one model: what a project file carries besides the model itself. */
/** Native edits to a model: the edited and created elements as they are now, and the deleted ones. */
export interface SavedEdits<T = unknown> {
  elements: T[];
  deleted: string[];
  /** The levels when they differ from the model as opened (moved, added). */
  levels?: Array<{ name: string; z: number }>;
  /** Align locks (element, datum, centre or face). */
  locks?: unknown[];
}
export const saveEdits = (fileName: string, e: SavedEdits) => tx('readwrite', (s) => s.put(e, `edits:${fileName}`));
export const loadEdits = <T>(fileName: string) => tx<SavedEdits<T>>('readonly', (s) => s.get(`edits:${fileName}`));

export const saveDatums = (fileName: string, d: unknown) => tx('readwrite', (s) => s.put(d, `datums:${fileName}`));
export const loadDatums = <T>(fileName: string) => tx<T>('readonly', (s) => s.get(`datums:${fileName}`));
export const saveUnits = (fileName: string, u: unknown) => tx('readwrite', (s) => s.put(u, `units:${fileName}`));
export const loadUnits = <T>(fileName: string) => tx<T>('readonly', (s) => s.get(`units:${fileName}`));

export interface ModelState {
  datums?: unknown;
  units?: unknown;
  edits?: SavedEdits;
  views?: unknown;
  graphics?: unknown;
  pending?: SavedPending;
  rates?: unknown;
}

export async function snapshotFor(fileName: string): Promise<ModelState> {
  const read = (k: string) => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null') as unknown;
    } catch {
      return null;
    }
  };
  // changes staged for Revit: kept per Revit document (shanku.revitPending.<key>) for the model linked to it
  const link = read('shanku.revitLink') as { key: string; fileName: string } | null;
  const changes = link && link.fileName === fileName ? (read(`shanku.revitPending.${link.key}`) as unknown[] | null) : null;
  return {
    views: await loadViews(fileName),
    graphics: await loadGraphics(fileName),
    pending: link && changes?.length ? { key: link.key, changes } : undefined,
    rates: read(`shanku.rates.${fileName}`) ?? undefined,
    edits: (await loadEdits(fileName)) ?? undefined,
    datums: (await loadDatums(fileName)) ?? undefined,
    units: (await loadUnits(fileName)) ?? undefined,
  };
}

/** Writes a model's kept state (from a project file) so opening the model restores it. */
export async function seedFrom(fileName: string, st: ModelState): Promise<void> {
  if (st.views !== undefined) await saveViews(fileName, st.views);
  if (st.edits !== undefined) await saveEdits(fileName, st.edits);
  if (st.datums !== undefined) await saveDatums(fileName, st.datums);
  if (st.units !== undefined) await saveUnits(fileName, st.units);
  if (st.graphics !== undefined) await saveGraphics(fileName, st.graphics);
  if (st.pending?.key && st.pending.changes.length) localStorage.setItem(`shanku.revitPending.${st.pending.key}`, JSON.stringify(st.pending.changes));
  if (st.rates !== undefined) localStorage.setItem(`shanku.rates.${fileName}`, JSON.stringify(st.rates));
}

/** The file a project was last saved to or opened from (Chrome and Edge keep the handle, so Ctrl + S writes back). */
export const saveProjectHandle = (fileName: string, handle: unknown) => tx('readwrite', (s) => s.put(handle, `projectHandle:${fileName}`));
export const loadProjectHandle = <T>(fileName: string) => tx<T>('readonly', (s) => s.get(`projectHandle:${fileName}`));

