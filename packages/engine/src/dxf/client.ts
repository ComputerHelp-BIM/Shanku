import type { DxfRequest, DxfResponse, PipelineOptions } from './protocol';
import type { PipelineSummary } from '../pipeline/types';
import type { ParsedDrawing } from './types';

/** Promise API over the DXF worker. The first open downloads Python and ezdxf once. */
export class DxfClient {
  private worker: Worker;
  private nextId = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pending = new Map<number, { resolve: (d: any) => void; reject: (e: Error) => void; onPhase?: (t: string) => void }>();

  constructor(worker?: Worker) {
    this.worker = worker ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<DxfResponse>) => {
      const msg = event.data;
      const p = this.pending.get(msg.requestId);
      if (!p) return;
      if (msg.type === 'phase') return p.onPhase?.(msg.text);
      this.pending.delete(msg.requestId);
      if (msg.type === 'opened') p.resolve(msg.drawing);
      else if (msg.type === 'entity') p.resolve(JSON.parse(msg.props));
      else if (msg.type === 'pipeline') p.resolve({ summary: JSON.parse(msg.summary) as PipelineSummary, ifc: msg.ifc });
      else p.reject(new Error(msg.message));
    };
  }

  open(fileName: string, bytes: ArrayBuffer, onPhase?: (text: string) => void): Promise<ParsedDrawing> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onPhase });
      const msg: DxfRequest = { type: 'open', requestId, fileName, bytes, drawingId: `d${requestId}` };
      this.worker.postMessage(msg, [bytes]);
    });
  }

  /** Properties of one DXF object (like AutoCAD's Properties palette), or null when unknown. */
  entity(drawingId: string, handle: string): Promise<Record<string, string | number | number[]> | null> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ type: 'entity', requestId, drawingId, handle } satisfies DxfRequest);
    });
  }

  /** Lets the worker close a drawing that is no longer shown. */
  forget(drawingId: string): void {
    const requestId = this.nextId++;
    this.pending.set(requestId, { resolve: () => undefined, reject: () => undefined });
    this.worker.postMessage({ type: 'forget', requestId, drawingId } satisfies DxfRequest);
  }

  /**
   * DXF -> 3D pipeline. Pass the file the first time; later calls (e.g. build with edited level
   * names or heights) reuse it. Returns the review summary, and the IFC text when options.build is set.
   */
  pipeline(options: PipelineOptions, file?: { fileName: string; bytes: ArrayBuffer }, onPhase?: (text: string) => void): Promise<{ summary: PipelineSummary; ifc: string }> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onPhase });
      const msg: DxfRequest = { type: 'pipeline', requestId, options, fileName: file?.fileName, bytes: file?.bytes };
      this.worker.postMessage(msg, file ? [file.bytes] : []);
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('DXF worker stopped.'));
    this.pending.clear();
  }
}
