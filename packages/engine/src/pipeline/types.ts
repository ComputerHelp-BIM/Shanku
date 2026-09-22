/** What the DXF -> 3D pipeline reports for the review screen (mirrors dxf2ifc.summary_for_js). */
export interface PipelineLevel {
  number: number;
  name: string;
  /** mm */
  elevation: number;
  /** mm; null for the foundation level */
  height: number | null;
  foundation: boolean;
}

export interface PipelineQa {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  /** DXF coordinates of the problem, when it has a place. */
  at: [number, number] | null;
  layer: string | null;
  handle: string | null;
  bounds: [number, number, number, number] | null;
}

export interface PipelineSummary {
  version: string;
  frames: Array<{ part: number; levels: number[]; label: string | null; height: number | null; origin: [number, number]; bounds: number[]; foundation: boolean }>;
  levels: PipelineLevel[];
  counts: Array<{ level: number; kind: string; count: number }>;
  qa: PipelineQa[];
  ms: number;
  report: { elements: number; openings: number; by_kind: Record<string, number> } | null;
}
