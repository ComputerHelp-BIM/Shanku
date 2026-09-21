import type { ParsedModel, PropertyGroup } from '../model/types';

/** Main thread -> worker. */
export type WorkerRequest =
  | { type: 'init'; wasmPath: string }
  | { type: 'open'; requestId: number; fileName: string; bytes: ArrayBuffer }
  | { type: 'properties'; requestId: number; expressId: number }
  | { type: 'close' };

/** Worker -> main thread. */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; requestId: number; done: number; total: number }
  | { type: 'opened'; requestId: number; model: ParsedModel }
  | { type: 'properties'; requestId: number; groups: PropertyGroup[] }
  | { type: 'error'; requestId: number | null; message: string };
