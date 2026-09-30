/**
 * The project file: Save (Ctrl + S) writes the model and everything Shanku keeps for it to one file
 * (lib/project), back to the same file where the browser allows it (Chrome and Edge keep the file's handle,
 * even after a reload); Save As picks a new one; elsewhere the project is downloaded. Opening a project
 * writes its state into the browser's store, then opens the model, so the usual restore brings views,
 * graphics, rates and changes for Revit back. Work is never only in memory: the store keeps it as it
 * changes; the file is for keeping, sending and opening elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '../../app/constants';
import { downloadFile } from '../../lib/excel';
import type { PickedFile } from '../../lib/openFile';
import { PROJECT_EXT, isProjectFile, packProject, projectNameFor, unpackProject } from '../../lib/project';
import { loadModel, loadProjectHandle, saveProjectHandle, seedFrom, snapshotFor } from '../../lib/session';
import type { useShankuModel } from '../../lib/useShankuModel';

/** The parts of the File System Access API Shanku uses (Chrome, Edge). */
interface FileHandle {
  name: string;
  createWritable(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
type SavePicker = (o: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileHandle>;

export interface ProjectStatus {
  /** The file the project was last saved to or opened from; null: not saved to a file yet. */
  file: string | null;
  /** Saved back to that file (true) or downloaded (false). */
  linked: boolean;
  savedAt: number | null;
  /** Changed since it was last saved to its file. */
  dirty: boolean;
}

export interface ProjectFileDeps {
  m: ReturnType<typeof useShankuModel>;
  openModelFile: (file: { name: string; bytes: ArrayBuffer }) => unknown;
  setNotice: (n: string | null) => void;
  /** Anything that changes when the project changes (views, graphics, changes for Revit…). */
  changes: readonly unknown[];
}

async function writable(h: FileHandle): Promise<boolean> {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

export function useProjectFile({ m, openModelFile, setNotice, changes }: ProjectFileDeps) {
  const [status, setStatus] = useState<ProjectStatus>({ file: null, linked: false, savedAt: null, dirty: false });
  const handle = useRef<FileHandle | null>(null);
  const quiet = useRef(true); // changes caused by opening or saving are not the user's
  const fileName = m.model?.info.fileName ?? null;

  // a model opened: its project file (if it had one) and a clean state
  useEffect(() => {
    quiet.current = true;
    handle.current = null;
    setStatus({ file: null, linked: false, savedAt: null, dirty: false });
    if (!fileName) return;
    void loadProjectHandle<FileHandle>(fileName).then((h) => {
      if (h) {
        handle.current = h;
        setStatus((s) => ({ ...s, file: h.name, linked: true }));
      }
    });
  }, [fileName]);
  // the project changed since it was saved to its file
  useEffect(() => {
    if (quiet.current) {
      quiet.current = false;
      return;
    }
    setStatus((s) => (s.dirty ? s : { ...s, dirty: true }));
  }, changes); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(
    async (as = false) => {
      if (!m.model || !fileName) return setNotice('Open a model first; a project holds a model.');
      const kept = await loadModel();
      if (!kept || kept.name !== fileName) return setNotice('The open model is not kept on this device any more; open it again, then save.');
      const bytes = packProject({ name: kept.name, bytes: new Uint8Array(kept.bytes) }, await snapshotFor(kept.name), APP_VERSION);
      let h = as ? null : handle.current;
      if (h && !(await writable(h).catch(() => false))) h = null;
      const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
      if (!h && picker) {
        try {
          h = await picker({ suggestedName: status.file ?? projectNameFor(kept.name), types: [{ description: 'Shanku project', accept: { 'application/x-shanku-project': [PROJECT_EXT] } }] });
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          h = null;
        }
      }
      if (h) {
        const w = await h.createWritable();
        await w.write(bytes as BufferSource);
        await w.close();
        handle.current = h;
        await saveProjectHandle(kept.name, h);
        setStatus({ file: h.name, linked: true, savedAt: Date.now(), dirty: false });
        m.log(`Saved ${h.name} (${(bytes.byteLength / 1e6).toFixed(1)} MB): the model, views, graphics, rates and changes for Revit.`);
        setNotice(`Saved ${h.name}.`);
      } else {
        const name = projectNameFor(kept.name);
        downloadFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, name, 'application/zip');
        setStatus({ file: name, linked: false, savedAt: Date.now(), dirty: false });
        setNotice(`Downloaded ${name}. This browser cannot save back to a file (Chrome and Edge can); your work is kept on this device meanwhile.`);
      }
    },
    [m, fileName, status.file, setNotice],
  );

  /** Opens a project file: its state first, then its model (the usual restore does the rest). */
  const openProject = useCallback(
    async (file: PickedFile & { handle?: unknown }) => {
      const p = unpackProject(new Uint8Array(file.bytes));
      await seedFrom(p.model.name, p.state);
      // an older .shk is saved as a new .shkp, not over the old file
      if (file.handle && file.name.toLowerCase().endsWith(PROJECT_EXT)) await saveProjectHandle(p.model.name, file.handle);
      await openModelFile({ name: p.model.name, bytes: p.model.bytes.buffer.slice(p.model.bytes.byteOffset, p.model.bytes.byteOffset + p.model.bytes.byteLength) as ArrayBuffer });
      m.log(`Opened the project ${file.name} (saved by Shanku ${p.manifest.app}, project schema ${p.manifest.schema}).`);
    },
    [m, openModelFile],
  );
  /** Any file the app opens: a project, or a model as before. */
  const openAnyFile = useCallback(
    async (file: PickedFile & { handle?: unknown }): Promise<void> => {
      if (isProjectFile(file.name)) await openProject(file);
      else await openModelFile(file);
    },
    [openProject, openModelFile],
  );

  // Ctrl + S saves; Ctrl + Shift + S saves as
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(e.shiftKey);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [save]);
  // leaving with a project file older than the work: the browser asks (the work itself is kept on this device)
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (status.linked && status.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [status.linked, status.dirty]);

  return { projectStatus: status, saveProject: () => save(false), saveProjectAs: () => save(true), openAnyFile };
}
