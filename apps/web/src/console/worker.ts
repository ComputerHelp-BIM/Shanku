/// <reference lib="webworker" />
// Python console worker: Pyodide (MPL-2.0) from jsDelivr, same build as the DXF reader, plus the shanku API.
import shankuSource from './shanku.py?raw';
import { PYODIDE_INDEX_URL as INDEX_URL } from '@shanku/engine/pyodide';

declare const self: DedicatedWorkerGlobalScope;

type Py = {
  runPython: (code: string) => unknown;
  globals: { get: (k: string) => unknown; set: (k: string, v: unknown) => void };
  FS: { writeFile: (p: string, d: string) => void; mkdirTree: (p: string) => void };
};
export type ConsoleRequest =
  | { id: number; type: 'boot' }
  | { id: number; type: 'model'; payload: string }
  | { id: number; type: 'selection'; payload: string }
  | { id: number; type: 'run'; code: string };
export type ConsoleResponse = { id: number; ok: true; value: string } | { id: number; ok: false; error: string };

let py: Promise<Py> | null = null;
const boot = () =>
  (py ??= (async () => {
    const mod = (await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)) as { loadPyodide: (o: { indexURL: string }) => Promise<Py> };
    const p = await mod.loadPyodide({ indexURL: INDEX_URL });
    p.FS.mkdirTree('/shanku');
    p.FS.writeFile('/shanku/shanku.py', shankuSource);
    p.runPython('import sys\nsys.path.insert(0, "/shanku")\nimport shanku\n_console_env = {"shanku": shanku, "__name__": "__console__"}');
    return p;
  })().catch((e) => {
    py = null;
    throw e;
  }));

self.onmessage = async (ev: MessageEvent<ConsoleRequest>) => {
  const m = ev.data;
  try {
    const p = await boot();
    let value = '';
    if (m.type === 'model' || m.type === 'selection') {
      p.globals.set('_payload', m.payload);
      value = String(p.runPython(m.type === 'model' ? 'shanku._load(_payload)' : 'shanku._set_selection(_payload)'));
    } else if (m.type === 'run') {
      p.globals.set('_code', m.code);
      value = String(p.runPython('shanku._run(_code, _console_env)'));
    }
    self.postMessage({ id: m.id, ok: true, value } satisfies ConsoleResponse);
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies ConsoleResponse);
  }
};
