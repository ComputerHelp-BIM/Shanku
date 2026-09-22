import type { ElementRecord, ModelInfo } from '@shanku/engine';
import type { ConsoleRequest, ConsoleResponse } from './worker';

export interface RunResult {
  stdout: string;
  stderr: string;
  repr: string | null;
  table: { columns: string[]; rows: unknown[][]; total: number } | null;
  error: string | null;
  actions: Array<{ type: 'select' | 'isolate' | 'hide' | 'reset' | 'fit'; indices?: number[] | null }>;
}

type Req = { type: 'boot' } | { type: 'model'; payload: string } | { type: 'selection'; payload: string } | { type: 'run'; code: string };

/** Talks to the console worker; requests run in order. */
export class ConsoleClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private seq = 0;
  private pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<ConsoleResponse>) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.value);
      else p.reject(new Error(ev.data.error));
    };
  }

  private send(req: Req): Promise<string> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id } as ConsoleRequest);
    });
  }

  boot = () => this.send({ type: 'boot' });

  setModel(elements: readonly ElementRecord[], info: ModelInfo | null) {
    const payload = JSON.stringify({
      elements: elements.map(({ bounds: _b, ...e }) => e),
      levels: info?.levels.map((l) => ({ name: l.name, elevation: l.elevation, count: l.elementCount })) ?? [],
      info: info ? { fileName: info.fileName, schema: info.schema, units: info.units, format: info.compatibility.format, rating: info.compatibility.level } : {},
    });
    return this.send({ type: 'model', payload });
  }

  setSelection(indices: readonly number[]) {
    return this.send({ type: 'selection', payload: JSON.stringify(indices) });
  }

  async run(code: string): Promise<RunResult> {
    return JSON.parse(await this.send({ type: 'run', code })) as RunResult;
  }

  dispose() {
    this.worker.terminate();
  }
}
