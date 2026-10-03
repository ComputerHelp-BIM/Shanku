/**
 * Recent files for the File menu (Revit's Recent Documents): files opened through the system picker, newest first,
 * at most ten. Chrome and Edge give a file handle that can be kept and opened again (the browser asks for
 * permission); other browsers give none, so nothing is listed there. Kept in the session database.
 */
import { loadRecentList, saveRecentList } from './session';
import { unpack, type FileKind, type PickedFile } from './openFile';

export interface RecentFile {
  name: string;
  kind: FileKind;
  /** When it was last opened (ms). */
  at: number;
  handle: FileSystemFileHandleLike;
}

/** The parts of a FileSystemFileHandle used here (typed loosely: not every TypeScript DOM library has them). */
export interface FileSystemFileHandleLike {
  name: string;
  getFile(): Promise<File>;
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>;
  isSameEntry?(other: unknown): Promise<boolean>;
}

const MAX = 10;

export async function listRecent(): Promise<RecentFile[]> {
  try {
    return ((await loadRecentList<RecentFile>()) ?? []).filter((r) => r && r.handle && typeof r.handle.getFile === 'function');
  } catch {
    return [];
  }
}

/** Remembers a file opened through the picker (newest first; the same file moves to the top). */
export async function rememberRecent(name: string, kind: FileKind, handle: unknown): Promise<void> {
  const h = handle as FileSystemFileHandleLike | undefined;
  if (!h || typeof h.getFile !== 'function') return;
  try {
    const list = await listRecent();
    const kept: RecentFile[] = [];
    for (const r of list) {
      const same = r.name === name && r.kind === kind && (h.isSameEntry ? await h.isSameEntry(r.handle).catch(() => false) : true);
      if (!same) kept.push(r);
    }
    await saveRecentList([{ name, kind, at: Date.now(), handle: h }, ...kept].slice(0, MAX));
  } catch {
    // remembering is a convenience: never let it break opening a file
  }
}

export async function forgetRecent(entry: RecentFile): Promise<void> {
  const list = await listRecent();
  await saveRecentList(list.filter((r) => !(r.name === entry.name && r.at === entry.at)));
}

/** Opens a recent file again: asks the browser for permission to read it if needed. */
export async function openRecent(entry: RecentFile): Promise<PickedFile> {
  const h = entry.handle;
  const mode = { mode: 'read' as const };
  if (h.queryPermission && (await h.queryPermission(mode)) !== 'granted') {
    if (!h.requestPermission || (await h.requestPermission(mode)) !== 'granted') throw new Error(`Permission to read ${entry.name} was not given.`);
  }
  const file = await h.getFile();
  return { ...(await unpack({ name: file.name, bytes: await file.arrayBuffer() })), handle: h };
}
