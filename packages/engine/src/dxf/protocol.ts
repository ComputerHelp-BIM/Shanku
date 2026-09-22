import type { ParsedDrawing } from './types';

export type DxfRequest =
  | { type: 'open'; requestId: number; fileName: string; bytes: ArrayBuffer; drawingId: string }
  | { type: 'entity'; requestId: number; drawingId: string; handle: string }
  | { type: 'forget'; requestId: number; drawingId: string }
  /** DXF -> 3D pipeline: bytes are sent with the first call and kept by the worker for later builds. */
  | { type: 'pipeline'; requestId: number; fileName?: string; bytes?: ArrayBuffer; options: PipelineOptions };

export interface PipelineOptions {
  names?: Record<string, string>;
  heights?: Record<string, number>;
  build?: boolean;
  project?: string;
  source?: string;
}

export type DxfResponse =
  | { type: 'phase'; requestId: number; text: string }
  | { type: 'opened'; requestId: number; drawing: ParsedDrawing }
  | { type: 'pipeline'; requestId: number; summary: string; ifc: string }
  | { type: 'entity'; requestId: number; props: string }
  | { type: 'error'; requestId: number; message: string };
