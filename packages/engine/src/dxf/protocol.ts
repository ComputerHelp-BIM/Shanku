import type { ParsedDrawing } from './types';

export type DxfRequest = { type: 'open'; requestId: number; fileName: string; bytes: ArrayBuffer };

export type DxfResponse =
  | { type: 'phase'; requestId: number; text: string }
  | { type: 'opened'; requestId: number; drawing: ParsedDrawing }
  | { type: 'error'; requestId: number; message: string };
