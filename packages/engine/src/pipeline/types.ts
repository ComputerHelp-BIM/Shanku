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
  /** With the `exchange` option: the model as Revit needs it (dxf2ifc.exchange). */
  exchange?: RevitExchange;
}

/** Export to Revit: levels and elements in mm from the drawing origin (Revit's Project Base Point). */
export interface RevitExchange {
  version: 1;
  units: 'mm';
  levels: Array<{ name: string; elevation: number; foundation: boolean }>;
  elements: RevitExchangeElement[];
  /** Drawn but not exported (windows and doors for now, odd outlines), with the reason. */
  skipped: Array<RevitExchangeElement & { reason: string }>;
}

export interface RevitExchangeElement {
  /** Stable: drawing handle and level ("DXF:1A2:L3"). Revit keeps it in CH-ID. */
  id: string;
  kind: 'column' | 'pedestal' | 'beam' | 'wall' | 'slab' | 'chajja' | 'footing' | 'pcc' | 'window' | 'door';
  mark: string;
  material: string | null;
  level: string;
  z0: number;
  z1: number;
  shape?: 'rect' | 'round';
  center?: [number, number];
  width?: number;
  length?: number;
  diameter?: number;
  angle?: number;
  thickness?: number;
  depth?: number;
  start?: [number, number];
  end?: [number, number];
  outline?: Array<[number, number]>;
}
