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
  /** Which open IFC file the element's properties live in: 0 the model, 1+ merged updates. */
  source?: number;
  /**
   * The IfcBuildingStorey the file puts it in (Revit files columns and walls under their base level).
   * For reference only: `level` follows Shanku's level definition (model/levelRule.ts).
   */
  storey?: string;
  /** Its CH-LEVEL parameter, when it has one (a label; QA flags one that differs from `level`). */
  chLevel?: string;
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
  /** Detected mark (see mark rules); empty when none found. */
  mark: string;
  /** Where the mark came from, e.g. "01--COLUMN_M.ID". */
  markSource: string;
  /** Concrete grade or material for BOQ grouping, e.g. "M30" or "RCC_COLUMN". */
  grade: string;
  /** "Pset.Property", "IfcMaterial", or "" when none. */
  gradeSource: string;
  /** Concrete volume, m³: IFC NetVolume, else GrossVolume, else computed from the geometry. */
  volume: number;
  /** m² for slabs (plan area) and walls (side area); null for other categories or when unknown. */
  area: number | null;
  /** m for columns (height), beams and members (length); null otherwise. */
  length: number | null;
  /** Where volume, area and length came from. */
  quantitySource: 'ifc' | 'geometry';
  /**
   * Dimensions in m, null where not meaningful for the category.
   * Column: width × depth section, height · Beam: length, width, depth · Slab: length × width, depth (thickness)
   * Wall: length, width (thickness), height · Footing: length, width, depth · Stair: length, width, height.
   */
  dims: { length: number | null; width: number | null; depth: number | null; height: number | null };
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

/**
 * How a file's levels relate to its elements: 'top' — a level is the top of its storey (Revit's
 * structural convention, Shanku's DXF → 3D, models built by Export to Revit): Shanku's level definition
 * applies; 'floor' — levels are floors with no level at the roof (many other IFCs): the file's storeys
 * are kept.
 */
export type LevelConvention = 'top' | 'floor';

export interface ModelInfo {
  /** Which reading of levels applies (model/levelRule.ts). */
  levelConvention?: LevelConvention;
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
  /** How well this export suits Shanku. */
  compatibility: import('../ifc/compat').Compatibility;
  viewDefinition: string;
  quantitySets: number;
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
  /**
   * The translation/rotation web-ifc applied to bring the file near the origin (column-major 4×4).
   * Patches (partial exports) are mapped into the full model's space with it.
   */
  coordination?: number[];
  /** Updates merged into this model since it was opened (0 or absent: as opened). */
  revision?: number;
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
