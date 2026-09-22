import type { ParsedModel, PropertyGroup } from '../model/types';

/** Main thread -> worker. */
export type WorkerRequest =
  | { type: 'init'; wasmPath: string }
  | { type: 'open'; requestId: number; fileName: string; bytes: ArrayBuffer; markRules?: string[] }
  | { type: 'marks'; requestId: number; rules: string[] }
  | { type: 'properties'; requestId: number; expressId: number }
  | { type: 'close' };

/** Worker -> main thread. */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; requestId: number; done: number; total: number }
  | { type: 'opened'; requestId: number; model: ParsedModel }
  | { type: 'properties'; requestId: number; groups: PropertyGroup[] }
  | { type: 'marks'; requestId: number; marks: Array<[number, string, string]> }
  | { type: 'error'; requestId: number | null; message: string };
