import { objectTypeLabel, type EntityIndex, type ParsedDrawing } from '@shanku/engine';

/**
 * AutoCAD's object isolation (ISOLATEOBJECTS / HIDEOBJECTS / UNISOLATEOBJECTS) for the 2D view:
 * either only `entities` show (isolate), or everything but `entities` shows (hide).
 */
export interface ObjectVisibility {
  mode: 'isolate' | 'hide';
  entities: number[];
}

/**
 * The visibility after one Isolate menu action, as AutoCAD does it: isolating again narrows to the
 * new selection, hiding inside an isolation removes objects from it, and hiding twice adds up.
 * An empty selection changes nothing (except End, which always shows everything).
 */
export function nextObjectVisibility(cur: ObjectVisibility | null, action: 'isolate' | 'hide' | 'end', selection: readonly number[]): ObjectVisibility | null {
  if (action === 'end') return null;
  if (!selection.length) return cur;
  if (action === 'isolate') return { mode: 'isolate', entities: [...new Set(selection)].sort((a, b) => a - b) };
  const sel = new Set(selection);
  if (cur?.mode === 'isolate') return { mode: 'isolate', entities: cur.entities.filter((e) => !sel.has(e)) };
  const hidden = new Set(cur?.mode === 'hide' ? cur.entities : []);
  for (const e of sel) hidden.add(e);
  return { mode: 'hide', entities: [...hidden].sort((a, b) => a - b) };
}

/** Per-entity mask for the viewer (1 = hidden), or null when everything shows. */
export function hiddenMask(vis: ObjectVisibility | null, count: number): Uint8Array | null {
  if (!vis) return null;
  const mask = new Uint8Array(count).fill(vis.mode === 'isolate' ? 1 : 0);
  const v = vis.mode === 'isolate' ? 0 : 1;
  for (const e of vis.entities) if (e >= 0 && e < count) mask[e] = v;
  return mask;
}

/** Objects the user can see: drawn, on a layer that is on, and not hidden by isolation. */
export function visibleObjects(index: EntityIndex, layerOn: readonly boolean[], vis: ObjectVisibility | null): number[] {
  const mask = hiddenMask(vis, index.layer.length);
  const out: number[] = [];
  for (let e = 0; e < index.layer.length; e++) {
    const l = index.layer[e];
    if (l < 0 || !layerOn[l] || mask?.[e]) continue;
    out.push(e);
  }
  return out;
}

/**
 * Select Similar (SELECTSIMILAR): visible objects with the same type, layer and colour as any of the
 * selected ones. The seeds are always kept, so the command never drops what was picked.
 */
export function selectSimilar(types: readonly string[], index: EntityIndex, seeds: readonly number[], visible: readonly number[]): number[] {
  const key = (e: number) => `${types[e] ?? ''}|${index.layer[e]}|${index.color[e]}`;
  const want = new Set(seeds.map(key));
  const out = new Set(seeds);
  for (const e of visible) if (want.has(key(e))) out.add(e);
  return [...out].sort((a, b) => a - b);
}

/** Quick Select (QSELECT) criteria; null in a field means "any". */
export interface QuickSelectCriteria {
  /** Entire drawing, or only the current selection. */
  scope: 'drawing' | 'selection';
  /** DXF type, e.g. "LINE". */
  type: string | null;
  layer: number | null;
  /** Palette index (the colour as drawn). */
  color: number | null;
  /** Include matching objects, or everything in scope except them. */
  apply: 'include' | 'exclude';
  /** Add to the current selection instead of replacing it. */
  append: boolean;
}

export const DEFAULT_QUICK_SELECT: QuickSelectCriteria = { scope: 'drawing', type: null, layer: null, color: null, apply: 'include', append: false };

/** The new selection for a Quick Select, from visible objects only. */
export function quickSelect(types: readonly string[], index: EntityIndex, visible: readonly number[], current: readonly number[], c: QuickSelectCriteria): number[] {
  const cur = new Set(current);
  const pool = c.scope === 'selection' ? visible.filter((e) => cur.has(e)) : visible;
  const match = (e: number) => (c.type === null || types[e] === c.type) && (c.layer === null || index.layer[e] === c.layer) && (c.color === null || index.color[e] === c.color);
  const picked = pool.filter((e) => match(e) === (c.apply === 'include'));
  if (!c.append) return picked;
  return [...new Set([...current, ...picked])].sort((a, b) => a - b);
}

/** Count (COUNT): objects by type, most common first, with the layers they are on. */
export function countObjects(types: readonly string[], index: EntityIndex, entities: readonly number[]): { total: number; byType: Array<[string, number]>; layers: number } {
  const byType = new Map<string, number>();
  const layers = new Set<number>();
  for (const e of entities) {
    const t = objectTypeLabel(types[e] ?? 'Unknown');
    byType.set(t, (byType.get(t) ?? 0) + 1);
    if (index.layer[e] >= 0) layers.add(index.layer[e]);
  }
  return { total: entities.length, byType: [...byType].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), layers: layers.size };
}

export interface TextHit {
  entity: number;
  text: string;
  layer: number;
}

/**
 * Find (FIND) in the drawing's text: TEXT, MTEXT and block attributes. Visible text only, one hit per
 * text item (a block with three matching attributes gives three hits, all selecting the block).
 */
export function findText(texts: ParsedDrawing['texts'], query: string, opts: { matchCase?: boolean; wholeWord?: boolean; isVisible?: (entity: number, layer: number) => boolean } = {}): TextHit[] {
  const q = query.trim();
  if (!q) return [];
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(opts.wholeWord ? `(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])` : esc, opts.matchCase ? 'u' : 'iu');
  const out: TextHit[] = [];
  for (const t of texts) {
    const [, , , , , , text, , layer, entity] = t;
    if (opts.isVisible && !opts.isVisible(entity, layer)) continue;
    if (re.test(text)) out.push({ entity, text, layer });
  }
  return out;
}

/** AutoCAD's coordinate readout: "3848.554, 32325.752, 0.000". */
export function formatPoint(x: number, y: number, decimals = 3): string {
  return `${x.toFixed(decimals)}, ${y.toFixed(decimals)}, ${(0).toFixed(decimals)}`;
}

type Props = Record<string, string | number | number[]>;

/** Object properties as plain text for the clipboard, one "Name: value" per line. */
export function propsAsText(props: Props): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n');
}

/**
 * The rows AutoCAD's Quick Properties panel shows for a type (after Color, Layer, Linetype):
 * a polyline shows Global width and Closed, a line its Length, a circle its Radius and Area.
 */
const QUICK_FIELDS: Record<string, string[]> = {
  Polyline: ['Global width', 'Closed', 'Length', 'Area'],
  Line: ['Length', 'Angle (°)'],
  Circle: ['Radius', 'Diameter', 'Area'],
  Arc: ['Radius', 'Arc length'],
  Text: ['Contents', 'Height'],
  MText: ['Contents', 'Height'],
  Insert: ['Block', 'Rotation (°)'],
  Hatch: ['Pattern', 'Solid fill'],
  Dimension: ['Measurement', 'Text override'],
};

/** Quick Properties rows for one object's properties: [label, value]. */
export function quickPropertyRows(props: Props): Array<[string, string]> {
  const fmt = (v: string | number | number[]) => (Array.isArray(v) ? v.map((n) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 })).join(', ') : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : v);
  const fields = ['Color', 'Layer', 'Linetype', ...(QUICK_FIELDS[String(props.Type)] ?? [])];
  return fields.filter((f) => props[f] !== undefined).map((f) => [f, fmt(props[f])]);
}
