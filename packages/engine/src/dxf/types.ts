export type TextAlignH = 'left' | 'center' | 'right';
export type TextAlignV = 'baseline' | 'bottom' | 'middle' | 'top';

/** [x, y, height, rotationDeg, alignH, alignV, text, colorIndex, layerIndex] — drawing units, rebased. */
export type DrawingText = [number, number, number, number, TextAlignH, TextAlignV, string, number, number];

export interface DrawingLayer {
  name: string;
  /** The layer's own on/thawed state in the file. */
  on: boolean;
  count: number;
}

export interface DrawingInfo {
  version: string;
  release: string;
  insunits: number;
  /** Declared drawing units, e.g. "mm", "in", "unitless". */
  units: string;
  /** Subtracted from all coordinates to keep float32 precise; add back for real coordinates. */
  origin: [number, number];
  extents: [number, number, number, number];
  segments: number;
  polygons: number;
  texts: number;
  layers: number;
  recovered_errors: number;
  timings: { read: number; geometry: number; text: number };
  extractor: string;
  ezdxf: string;
}

export interface ParsedDrawing {
  fileName: string;
  fileSize: number;
  info: DrawingInfo;
  /** "#rrggbb"; "#000000" means colour 7 (foreground) and follows the theme. */
  palette: string[];
  layers: DrawingLayer[];
  texts: DrawingText[];
  /** x1, y1, x2, y2 per segment. */
  seg: Float32Array;
  segColor: Uint16Array;
  segLayer: Uint16Array;
  /** Polygon vertices (x, y); polygon i spans polyStart[i] .. polyStart[i+1]. */
  poly: Float32Array;
  polyStart: Uint32Array;
  polyColor: Uint16Array;
  polyLayer: Uint16Array;
  /** Wall-clock ms in the worker, including Python start-up. */
  loadMs: number;
}
