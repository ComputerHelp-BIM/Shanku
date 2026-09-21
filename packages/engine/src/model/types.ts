/** Categories Shanku understands in v0.1. Everything else is "Other". */
export type Category =
  | 'Column'
  | 'Beam'
  | 'Slab'
  | 'Wall'
  | 'Footing'
  | 'Pile'
  | 'Rebar'
  | 'Stair'
  | 'Member'
  | 'Plate'
  | 'Other';

/** One selectable element. `index` is its position in the model and in the GPU buffers. */
export interface ElementRecord {
  index: number;
  /** STEP line number. Shown as the Element ID: short, readable, stable within one file. */
  expressId: number;
  /** IFC GlobalId (22 chars): the permanent identity across files and revisions. */
  globalId: string;
  ifcClass: string;
  category: Category;
  name: string;
  /** IFC Tag. Revit writes its own ElementId here. */
  tag: string;
  typeName: string;
  level: string;
  /** Axis-aligned bounds in viewer coordinates (metres, Y up): [minX,minY,minZ,maxX,maxY,maxZ]. */
  bounds: [number, number, number, number, number, number];
}

export interface Level {
  name: string;
  /** Project length units, as written in the file. */
  elevation: number | null;
  elementCount: number;
}

export interface ModelUnits {
  length: string;
  area: string;
  volume: string;
}

export interface ModelInfo {
  fileName: string;
  fileSize: number;
  schema: string;
  projectName: string;
  units: ModelUnits;
  levels: Level[];
  categories: Partial<Record<Category, number>>;
  elementCount: number;
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
  /** Viewer-space bounds of the whole model, metres. */
  bounds: [number, number, number, number, number, number];
  /** Milliseconds per phase. */
  timings: { open: number; relations: number; geometry: number; total: number };
}

/** Geometry for the whole model in one set of buffers (one draw call). */
export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  /** Element index per vertex, as float (exact up to 16.7 million elements). */
  elementIds: Float32Array;
  indices: Uint32Array;
}

export interface EdgeBuffers {
  positions: Float32Array;
  elementIds: Float32Array;
}

export interface ParsedModel {
  info: ModelInfo;
  elements: ElementRecord[];
  mesh: MeshBuffers;
  edges: EdgeBuffers;
}

export type PropertyValue = string | number | boolean | null;

export interface PropertyItem {
  name: string;
  value: PropertyValue;
  /** Display unit, e.g. "mm", "m³". Empty when unitless or unknown. */
  unit: string;
}

export interface PropertyGroup {
  name: string;
  kind: 'attributes' | 'pset' | 'qto' | 'type';
  items: PropertyItem[];
}
