import type { ParsedModel, PropertyGroup } from '../model/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

export interface OpenProgress {
  done: number;
  total: number;
}

type Pending = {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  onProgress?: (p: OpenProgress) => void;
};

/**
 * Promise API over the IFC worker. Create one per app.
 * `wasmPath` is the URL folder holding web-ifc.wasm (e.g. `${BASE_URL}wasm/`).
 */
export class IfcClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private readyPromise: Promise<void>;

  constructor(wasmPath: string, worker?: Worker) {
    this.worker = worker ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    let markReady!: () => void;
    let failReady!: (e: Error) => void;
    this.readyPromise = new Promise<void>((res, rej) => {
      markReady = res;
      failReady = rej;
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'ready') return markReady();
      if (msg.type === 'error' && msg.requestId === null) return failReady(new Error(msg.message));
      const requestId = msg.requestId;
      if (requestId === null) return;
      const p = this.pending.get(requestId);
      if (!p) return;
      if (msg.type === 'progress') return p.onProgress?.({ done: msg.done, total: msg.total });
      this.pending.delete(requestId);
      if (msg.type === 'error') p.reject(new Error(msg.message));
      else if (msg.type === 'opened') p.resolve(msg.model);
      else if (msg.type === 'properties') p.resolve(msg.groups);
      else if (msg.type === 'marks') p.resolve(msg.marks);
      else if (msg.type === 'grades') p.resolve(msg.grades);
    };
    this.worker.onerror = (e) => failReady(new Error(e.message || 'The IFC worker failed to start.'));
    this.post({ type: 'init', wasmPath });
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Parses the file off the main thread. The ArrayBuffer is transferred (unusable afterwards). */
  async open(fileName: string, bytes: ArrayBuffer, onProgress?: (p: OpenProgress) => void, markRules?: readonly string[], gradeRules?: readonly string[]): Promise<ParsedModel> {
    await this.readyPromise;
    const requestId = this.nextId++;
    return new Promise<ParsedModel>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      this.post({ type: 'open', requestId, fileName, bytes, markRules: markRules ? [...markRules] : undefined, gradeRules: gradeRules ? [...gradeRules] : undefined }, [bytes]);
    });
  }

  /** Re-runs mark detection on the open model: [expressId, mark, source] for every element that has one. */
  async marks(rules: readonly string[]): Promise<Array<[number, string, string]>> {
    await this.readyPromise;
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.post({ type: 'marks', requestId, rules: [...rules] });
    });
  }

  async properties(expressId: number): Promise<PropertyGroup[]> {
    await this.readyPromise;
    const requestId = this.nextId++;
    return new Promise<PropertyGroup[]>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.post({ type: 'properties', requestId, expressId });
    });
  }

  /** Re-runs grade detection: [expressId, grade, source]; source "IfcMaterial" when no rule matched. */
  async grades(rules: readonly string[]): Promise<Array<[number, string, string]>> {
    await this.readyPromise;
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.post({ type: 'grades', requestId, rules: [...rules] });
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('IFC worker stopped.'));
    this.pending.clear();
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }
}
