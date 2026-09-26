/**
 * Shanku's one definition of an element's level, for every model (DXF → 3D, loaded from Revit, any
 * IFC), matching Revit's structural convention and the Computer Help drawings:
 *
 *   An element's level is the lowest level at or above its top.
 *
 * Columns and walls belong to the level they rise to, beams and slabs to the level they hang from
 * (sunk or not), foundations to Level 1 (±0). Beams, slabs and footings may rise up to
 * UPSTAND_TOLERANCE above their level (upstands) and still belong to it; everything else follows its
 * top exactly. An element above the highest level (a roof parapet) belongs to the highest level.
 *
 * The IFC storey an exporter files the element under is kept as `storey` (Revit files columns and
 * walls under their base level); CH-LEVEL, a label, is kept as `chLevel` and checked by QA.
 *
 * Files whose levels are floors (no level at the roof: many IFCs from other programs) cannot be read
 * this way — their top storey would rise above every level and merge into the one below. They are
 * recognised (more than FLOOR_FILE_SHARE of the elements finish above the highest level) and keep
 * their own storeys.
 */
import type { ElementRecord, ParsedModel } from './types';

/** How far above its level a beam, slab or footing may rise and still belong to it (m). */
export const UPSTAND_TOLERANCE = 0.6;
/** Above this share of elements finishing above the highest level, a file's levels are floors. */
export const FLOOR_FILE_SHARE = 0.15;
const EXACT = 0.005; // 5 mm: drawing and export rounding
const HANGING = new Set(['Beam', 'Slab', 'Footing']);
const TO_M: Record<string, number> = { mm: 0.001, millimetre: 0.001, millimeter: 0.001, cm: 0.01, m: 1, metre: 1, meter: 1, ft: 0.3048, foot: 0.3048, in: 0.0254, inch: 0.0254 };

export interface LevelHeight {
  name: string;
  /** In the viewer's space (the file's origin shift included), metres. */
  y: number;
}

/**
 * The levels' heights in the viewer: each storey's declared elevation, scaled to metres and moved by
 * the file's origin shift (web-ifc COORDINATE_TO_ORIGIN); a storey without one: the lowest bottom of
 * what the file puts in it.
 */
export function levelHeightsOf(model: Pick<ParsedModel, 'info' | 'elements' | 'coordination'>): LevelHeight[] {
  const scale = TO_M[(model.info.units?.length ?? '').toLowerCase()] ?? 1;
  const oy = model.coordination && model.coordination.length === 16 ? model.coordination[13] : 0;
  const out: LevelHeight[] = [];
  for (const l of model.info.levels) {
    if (l.elevation !== null && l.elevation !== undefined && Number.isFinite(l.elevation)) out.push({ name: l.name, y: l.elevation * scale + oy });
    else {
      const on = model.elements.filter((e) => (e.storey ?? e.level) === l.name && hasGeometry(e));
      if (on.length) out.push({ name: l.name, y: Math.min(...on.map((e) => e.bounds[1])) });
    }
  }
  return out.sort((a, b) => a.y - b.y);
}

function hasGeometry(e: ElementRecord): boolean {
  return Number.isFinite(e.bounds[4]) && Number.isFinite(e.bounds[1]) && e.bounds[4] >= e.bounds[1];
}

/** The level of one element by the definition (null: no levels, or no geometry to judge by). */
export function levelOf(e: ElementRecord, levels: readonly LevelHeight[], upstand = UPSTAND_TOLERANCE): string | null {
  if (!levels.length || !hasGeometry(e)) return null;
  const top = e.bounds[4];
  const tol = HANGING.has(e.category) ? upstand : EXACT;
  return (levels.find((l) => l.y >= top - tol) ?? levels[levels.length - 1]).name;
}

/** 'floor' when more than FLOOR_FILE_SHARE of the elements finish above the highest level. */
export function conventionOf(model: Pick<ParsedModel, 'elements'>, levels: readonly LevelHeight[], upstand = UPSTAND_TOLERANCE): 'top' | 'floor' {
  if (!levels.length) return 'top';
  const highest = levels[levels.length - 1].y;
  const judged = model.elements.filter(hasGeometry);
  if (!judged.length) return 'top';
  const above = judged.filter((e) => e.bounds[4] > highest + (HANGING.has(e.category) ? upstand : EXACT)).length;
  return above / judged.length > FLOOR_FILE_SHARE ? 'floor' : 'top';
}

/**
 * Applies the definition to a model in place: `storey` keeps the file's filing, `level` becomes the
 * level by the definition, and the levels' element counts follow.
 */
export function assignLevels(model: ParsedModel, upstand = UPSTAND_TOLERANCE): void {
  for (const e of model.elements) if (e.storey === undefined) e.storey = e.level;
  const levels = levelHeightsOf(model);
  model.info.levelConvention = conventionOf(model, levels, upstand);
  if (model.info.levelConvention === 'floor') {
    for (const e of model.elements) e.level = e.storey ?? e.level; // the file's own storeys
    return; // its counts are already the file's
  }
  for (const e of model.elements) e.level = levelOf(e, levels, upstand) ?? e.storey ?? e.level;
  const counts = new Map<string, number>();
  for (const e of model.elements) if (e.level) counts.set(e.level, (counts.get(e.level) ?? 0) + 1);
  for (const l of model.info.levels) l.elementCount = counts.get(l.name) ?? 0;
}
