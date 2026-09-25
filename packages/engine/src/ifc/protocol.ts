import type { ParsedModel, PropertyGroup } from '../model/types';

/** Main thread -> worker. */
export type WorkerRequest =
  | { type: 'init'; wasmPath: string }
  /** patch: an update (partial export) opened beside the model, aligned to it, elements tagged with its slot. */
  | { type: 'open'; requestId: number; fileName: string; bytes: ArrayBuffer; markRules?: string[]; gradeRules?: string[]; patch?: boolean }
  | { type: 'grades'; requestId: number; rules: string[] }
  | { type: 'marks'; requestId: number; rules: string[] }
  | { type: 'properties'; requestId: number; expressId: number; source?: number }
  | { type: 'close' };

/** Worker -> main thread. */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; requestId: number; done: number; total: number }
  | { type: 'opened'; requestId: number; model: ParsedModel }
  | { type: 'properties'; requestId: number; groups: PropertyGroup[] }
  | { type: 'marks'; requestId: number; marks: Array<[number, string, string]> }
  | { type: 'grades'; requestId: number; grades: Array<[number, string, string]> }
  | { type: 'error'; requestId: number | null; message: string };
