import type { DxfRequest, DxfResponse } from './protocol';
import type { ParsedDrawing } from './types';

/** Promise API over the DXF worker. The first open downloads Python and ezdxf once. */
export class DxfClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (d: ParsedDrawing) => void; reject: (e: Error) => void; onPhase?: (t: string) => void }>();

  constructor(worker?: Worker) {
    this.worker = worker ?? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<DxfResponse>) => {
      const msg = event.data;
      const p = this.pending.get(msg.requestId);
      if (!p) return;
      if (msg.type === 'phase') return p.onPhase?.(msg.text);
      this.pending.delete(msg.requestId);
      if (msg.type === 'opened') p.resolve(msg.drawing);
      else p.reject(new Error(msg.message));
    };
  }

  open(fileName: string, bytes: ArrayBuffer, onPhase?: (text: string) => void): Promise<ParsedDrawing> {
    const requestId = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onPhase });
      const msg: DxfRequest = { type: 'open', requestId, fileName, bytes };
      this.worker.postMessage(msg, [bytes]);
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('DXF worker stopped.'));
    this.pending.clear();
  }
}
