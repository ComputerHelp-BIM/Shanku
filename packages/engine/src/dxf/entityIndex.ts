import type { ParsedDrawing } from './types';

/** What an object draws, as bit flags (an INSERT can draw lines, fills and text). */
export const OBJECT_KIND = { line: 1, fill: 2, text: 4 } as const;

/** Per-object facts the viewer knows without asking the worker, for Select Similar, Quick Select and Count. */
export interface EntityIndex {
  /** Layer index of the object's first primitive, or -1 when it drew nothing. */
  layer: Int32Array;
  /** Palette index of the object's first primitive, or -1 when it drew nothing. */
  color: Int32Array;
  /** OBJECT_KIND bits. */
  kind: Uint8Array;
}

type Source = Pick<ParsedDrawing, 'handles' | 'segEnt' | 'segLayer' | 'segColor' | 'polyEnt' | 'polyLayer' | 'polyColor' | 'texts'>;

/** One pass over the primitives: layer, colour and kind per model-space object. */
export function indexEntities(d: Source): EntityIndex {
  const n = d.handles.length;
  const layer = new Int32Array(n).fill(-1);
  const color = new Int32Array(n).fill(-1);
  const kind = new Uint8Array(n);
  const note = (e: number, l: number, c: number, k: number) => {
    if (e >= n) return;
    if (layer[e] < 0) {
      layer[e] = l;
      color[e] = c;
    }
    kind[e] |= k;
  };
  for (let i = 0; i < d.segEnt.length; i++) note(d.segEnt[i], d.segLayer[i], d.segColor[i], OBJECT_KIND.line);
  for (let i = 0; i < d.polyEnt.length; i++) note(d.polyEnt[i], d.polyLayer[i], d.polyColor[i], OBJECT_KIND.fill);
  for (const t of d.texts) note(t[9], t[8], t[7], OBJECT_KIND.text);
  return { layer, color, kind };
}

const SPECIAL: Record<string, string> = { LWPOLYLINE: 'Polyline', MTEXT: 'MText' };

/**
 * AutoCAD's name for a DXF type, as the Properties palette shows it: LINE → "Line",
 * LWPOLYLINE → "Polyline". Matches the worker's entity_props() so both places agree.
 */
export function objectTypeLabel(dxfType: string): string {
  return SPECIAL[dxfType] ?? dxfType.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}
