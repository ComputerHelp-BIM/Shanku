/// <reference lib="webworker" />
// DXF worker: runs ezdxf (MIT) inside Pyodide (MPL-2.0), loaded on first use from jsDelivr.
import extractSource from './extract.py?raw';
import type { DxfRequest, DxfResponse } from './protocol';
import type { ParsedDrawing } from './types';

declare const self: DedicatedWorkerGlobalScope;

export const PYODIDE_VERSION = '0.27.7';
export const EZDXF_VERSION = '1.4.4';
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

type PyProxy = { toJs: () => unknown; destroy: () => void };
type Pyodide = {
  loadPackage: (names: string[]) => Promise<void>;
  pyimport: (name: string) => { install: (spec: string) => Promise<void> };
  runPython: (code: string) => PyProxy | undefined;
  globals: { set: (k: string, v: unknown) => void };
  FS: { writeFile: (p: string, d: Uint8Array | string) => void; mkdirTree: (p: string) => void; unlink: (p: string) => void };
};

let pyodide: Promise<Pyodide> | null = null;
const post = (m: DxfResponse, transfer: Transferable[] = []) => self.postMessage(m, transfer);

function boot(requestId: number): Promise<Pyodide> {
  if (pyodide) return pyodide;
  pyodide = (async () => {
    post({ type: 'phase', requestId, text: 'Starting Python (first DXF only, about 15 MB)…' });
    const mod = (await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)) as { loadPyodide: (o: { indexURL: string }) => Promise<Pyodide> };
    const py = await mod.loadPyodide({ indexURL: INDEX_URL });
    post({ type: 'phase', requestId, text: 'Installing ezdxf…' });
    await py.loadPackage(['micropip', 'numpy', 'pillow']); // ezdxf's drawing add-on imports Pillow
    await py.pyimport('micropip').install(`ezdxf==${EZDXF_VERSION}`);
    py.FS.mkdirTree('/shanku');
    py.FS.writeFile('/shanku/extract.py', extractSource);
    py.runPython('import sys\nsys.path.insert(0, "/shanku")\nimport extract'); // returns None: nothing to destroy
    return py;
  })();
  pyodide.catch(() => (pyodide = null)); // allow a retry after a network failure
  return pyodide;
}

const view = <T>(C: { new (b: ArrayBuffer): T }, u8: Uint8Array): T =>
  new C(u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? (u8.buffer as ArrayBuffer) : u8.slice().buffer);

self.onmessage = async (event: MessageEvent<DxfRequest>) => {
  const msg = event.data;
  const t0 = performance.now();
  try {
    const py = await boot(msg.requestId);
    post({ type: 'phase', requestId: msg.requestId, text: `Reading ${msg.fileName}…` });
    py.FS.writeFile('/shanku/in.dxf', new Uint8Array(msg.bytes));
    const proxy = py.runPython('extract.extract_for_js("/shanku/in.dxf")');
    if (!proxy) throw new Error('The DXF extractor returned nothing.');
    const parts = proxy.toJs() as [string, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array];
    proxy.destroy();
    py.FS.unlink('/shanku/in.dxf');
    const head = JSON.parse(parts[0]) as Pick<ParsedDrawing, 'info' | 'palette' | 'layers' | 'texts'>;
    const drawing: ParsedDrawing = {
      ...head,
      fileName: msg.fileName,
      fileSize: msg.bytes.byteLength,
      seg: view(Float32Array, parts[1]),
      segColor: view(Uint16Array, parts[2]),
      segLayer: view(Uint16Array, parts[3]),
      poly: view(Float32Array, parts[4]),
      polyStart: view(Uint32Array, parts[5]),
      polyColor: view(Uint16Array, parts[6]),
      polyLayer: view(Uint16Array, parts[7]),
      loadMs: performance.now() - t0,
    };
    const d = drawing;
    post({ type: 'opened', requestId: msg.requestId, drawing }, [
      d.seg.buffer, d.segColor.buffer, d.segLayer.buffer, d.poly.buffer, d.polyStart.buffer, d.polyColor.buffer, d.polyLayer.buffer,
    ] as ArrayBuffer[]);
  } catch (err) {
    post({ type: 'error', requestId: msg.requestId, message: err instanceof Error ? err.message.split('\n').slice(-3).join(' ') : String(err) });
  }
};
